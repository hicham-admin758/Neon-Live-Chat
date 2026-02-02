import { google, youtube_v3 } from "googleapis";
import { Server } from "socket.io";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { storage } from "./storage";

// تعريف أنواع البيانات
interface Player {
  id: string;
  username: string;
  avatarUrl?: string;
  position: 'left' | 'right';
  isAlive: boolean;
}

interface GameState {
  leftPlayer: Player | null;
  rightPlayer: Player | null;
  targetNumber: number | null;
  isActive: boolean;
  countdownTimer: NodeJS.Timeout | null;
  startTime: number | null;
}

export class YouTubeGunDuelGame {
  private youtube;
  private io: Server;
  private isMonitoring: boolean = false;
  private liveChatId: string | null = null;
  private nextPageToken: string | null = null;

  // حالة اللعبة الحالية
  private currentGame: GameState = {
    leftPlayer: null,
    rightPlayer: null,
    targetNumber: null,
    isActive: false,
    countdownTimer: null,
    startTime: null
  };

  constructor(io: Server, apiKey: string) {
    this.io = io;
    this.youtube = google.youtube({ version: "v3", auth: apiKey });
    this.setupSocketListeners();
  }

  // دالة للتحقق من نشاط اللعبة
  public isActive(): boolean {
    return this.currentGame.isActive;
  }

  // ✅ إرسال القائمة فور اتصال الشاشة
  private setupSocketListeners() {
    this.io.on('connection', async (socket) => {
      console.log("🔌 شاشة جديدة اتصلت - إرسال البيانات...");

      try {
        // جلب اللاعبين النشطين (من لعبة القنبلة)
        const activePlayers = await storage.getUsers();

        // إرسال القائمة للشاشة الجديدة
        socket.emit('players_waiting', { 
          count: activePlayers.length, 
          players: activePlayers.map(p => ({ 
            username: p.username, 
            avatarUrl: p.avatarUrl 
          })) 
        });

        console.log(`📋 تم إرسال ${activePlayers.length} لاعب نشط إلى الشاشة`);

        // إرسال حالة اللعبة الحالية إذا كانت جارية
        if (this.currentGame.isActive && this.currentGame.leftPlayer && this.currentGame.rightPlayer) {
          socket.emit('game_started', {
            leftPlayer: this.getPublicPlayerData(this.currentGame.leftPlayer),
            rightPlayer: this.getPublicPlayerData(this.currentGame.rightPlayer)
          });

          console.log("🎮 تم إرسال حالة اللعبة الجارية");
        }

      } catch (error) {
        console.error('❌ خطأ في مزامنة الشاشة:', error);
      }

      // معالجة طلب القائمة
      socket.on('get_waiting_players', async () => {
        try {
          const activePlayers = await storage.getUsers();

          socket.emit('players_waiting', { 
            count: activePlayers.length, 
            players: activePlayers.map(p => ({ 
              username: p.username, 
              avatarUrl: p.avatarUrl 
            })) 
          });
        } catch (error) {
          console.error('❌ خطأ في جلب القائمة:', error);
        }
      });
    });
  }

  // 1. بدء مراقبة الشات
  async startMonitoring(videoId: string) {
    try {
      const response = await this.youtube.videos.list({
        part: ["liveStreamingDetails"],
        id: [videoId],
      });

      const details = response.data.items?.[0]?.liveStreamingDetails;
      if (!details?.activeLiveChatId) {
        throw new Error("Live chat ID not found. Is the video live?");
      }

      this.liveChatId = details.activeLiveChatId;
      this.isMonitoring = true;
      console.log("✅ بدء مراقبة الشات:", this.liveChatId);
      this.pollChat();

      return { liveChatId: this.liveChatId };
    } catch (error) {
      console.error("❌ خطأ في بدء المراقبة:", error);
      throw error;
    }
  }

  // 2. حلقة جلب الرسائل
  private async pollChat() {
    if (!this.isMonitoring || !this.liveChatId) return;

    try {
      const response = await this.youtube.liveChatMessages.list({
        liveChatId: this.liveChatId,
        part: ["snippet", "authorDetails"],
        pageToken: this.nextPageToken || undefined,
      });

      this.nextPageToken = response.data.nextPageToken || null;
      const messages = response.data.items || [];

      for (const msg of messages) {
        await this.processMessage(msg);
      }

    } catch (error) {
      console.error("❌ خطأ في استطلاع الشات:", error);
    }

    // زيادة فترة الاستطلاع لتجنب تجاوز حد YouTube API
    setTimeout(() => this.pollChat(), 20000); // 20 ثانية بدلاً من 10
  }

  // 3. تحليل الرسالة
  private async processMessage(msg: youtube_v3.Schema$LiveChatMessage) {
    const text = msg.snippet?.displayMessage?.trim();
    const authorId = msg.authorDetails?.channelId;
    const authorName = msg.authorDetails?.displayName;
    const authorAvatar = msg.authorDetails?.profileImageUrl;

    if (!text || !authorId || !authorName) return;

    console.log(`📨 رسالة من ${authorName}: ${text}`);

    // ✅ الأمر: !دخول - إضافة للقائمة (مشترك مع لعبة القنبلة)
    if (text === "!دخول" || text.toLowerCase() === "!join") {
      console.log(`✅ تم التعرف على أمر !دخول من ${authorName}`);
      await this.handleJoinCommand(authorId, authorName, authorAvatar || undefined);
    }

    // ✅ الأمر: !مبارزة أو !duel - بدء لعبة المسدسات
    if ((text === "!مبارزة" || text.toLowerCase() === "!duel") && !this.currentGame.isActive) {
      console.log(`🎲 ${authorName} طلب بدء مبارزة المسدسات`);
      await this.startGameFromActivePlayers();
    }

    // الإجابة في اللعبة (رقم)
    if (this.currentGame.isActive && this.currentGame.targetNumber !== null) {
      const parsedNumber = parseInt(text);
      if (!isNaN(parsedNumber)) {
        await this.handleGameInput(authorId, parsedNumber);
      }
    }
  }

  // 4. ✅ إضافة لاعب للقائمة النشطة (مشترك مع لعبة القنبلة) - مع Auto-Start
  private async handleJoinCommand(channelId: string, displayName: string, avatarUrl?: string) {
    try {
      // تجاهل اللاعبين الموجودين في اللعبة حالياً
      if (this.currentGame.leftPlayer?.id === channelId || this.currentGame.rightPlayer?.id === channelId) {
        console.log(`⚠️ ${displayName} في اللعبة حالياً - تم التجاهل`);
        return;
      }

      // إضافة/تحديث اللاعب في قاعدة البيانات
      const existingUser = await db.query.users.findFirst({
        where: eq(users.externalId, channelId)
      });

      if (existingUser) {
        await db.update(users)
          .set({ lobbyStatus: 'active' })
          .where(eq(users.externalId, channelId));

        console.log(`🔄 ${displayName} عاد للقائمة النشطة`);
      } else {
        await db.insert(users).values({
          username: displayName,
          avatarUrl: avatarUrl || null,
          externalId: channelId,
          lobbyStatus: 'active'
        });

        console.log(`✅ ${displayName} انضم للقائمة لأول مرة`);
      }

      // جلب القائمة المحدثة
      const activePlayers = await storage.getUsers();

      console.log(`📋 بعد الانضمام: ${activePlayers.length} لاعب نشط`);

      // ✅ تحديث الواجهة (كل اللاعبين يظهرون في القائمة السفلية)
      this.io.emit('players_waiting', { 
        count: activePlayers.length,
        players: activePlayers.map(p => ({ 
          username: p.username, 
          avatarUrl: p.avatarUrl 
        }))
      });

      console.log(`📋 القائمة النشطة: ${activePlayers.length} لاعب`);

      // 🚀 ✅ منطق Auto-Start الجديد
      if (activePlayers.length >= 2 && !this.currentGame.isActive) {
        console.log(`🎮 Auto-Start: تم الوصول إلى ${activePlayers.length} لاعبين - بدء اللعبة تلقائياً...`);
        await this.startGameFromActivePlayers();
      }

    } catch (error) {
      console.error('❌ خطأ في معالجة الانضمام:', error);
    }
  }

  // 5. ✅ بدء اللعبة من القائمة النشطة (المتابعين)
  // الفكرة: اللاعبون النشطين = المتابعين الذين كتبوا !دخول
  // يتم اختيار اثنين منهم كأهداف في الساحة
  // الآخرون يحاولون إطلاق النار عليهم بكتابة الرقم أولاً
  async startGameFromActivePlayers() {
    try {
      if (this.currentGame.isActive) {
        console.log("⚠️ هناك لعبة جارية بالفعل");
        return;
      }

      // جلب اللاعبين النشطين
      const activePlayers = await storage.getUsers();

      console.log(`🎮 بدء اللعبة: ${activePlayers.length} لاعب نشط`);

      // 🧪 وضع تجريبي: إذا لم يكن هناك لاعبين كافيين، أضف لاعبين وهميين
      if (activePlayers.length < 2) {
        console.log("🧪 وضع تجريبي: إضافة لاعبين وهميين للاختبار");

        // إضافة لاعبين وهميين
        const dummyPlayers = [
          {
            id: 999,
            username: "لاعب تجريبي 1",
            avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=dummy1",
            externalId: "dummy1",
            lobbyStatus: "active" as const,
            joinedAt: new Date().toISOString()
          },
          {
            id: 1000,
            username: "لاعب تجريبي 2",
            avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=dummy2",
            externalId: "dummy2",
            lobbyStatus: "active" as const,
            joinedAt: new Date().toISOString()
          }
        ];

        activePlayers.push(...dummyPlayers);
      }

      // تتطلب اللعبة بالضبط لاعبين اثنين
      if (activePlayers.length < 2) {
        console.log(`⚠️ اللعبة تتطلب بالضبط لاعبين اثنين: ${activePlayers.length}/2`);
        this.io.emit('error_message', {
          message: 'يجب وجود لاعبين اثنين على الأقل! (اكتب !دخول للانضمام)'
        });
        return;
      }

      // 🎲 اختيار لاعبين عشوائيين من القائمة
      const shuffled = [...activePlayers].sort(() => Math.random() - 0.5);
      const player1 = shuffled[0]; // لاعب عشوائي 1
      const player2 = shuffled[1]; // لاعب عشوائي 2

      console.log(`🎯 بدء مبارزة عشوائية بين: ${player1.username} vs ${player2.username}`);

      // تحديث حالتهم إلى "في اللعبة"
      await db.update(users)
        .set({ lobbyStatus: 'in_game' })
        .where(eq(users.externalId, player1.externalId!));

      await db.update(users)
        .set({ lobbyStatus: 'in_game' })
        .where(eq(users.externalId, player2.externalId!));

      // إعداد اللعبة - اللاعب الأول على اليمين، الثاني على اليسار
      this.currentGame = {
        leftPlayer: {
          id: player2.externalId!,
          username: player2.username,
          avatarUrl: player2.avatarUrl || undefined,
          position: 'left',
          isAlive: true
        },
        rightPlayer: {
          id: player1.externalId!,
          username: player1.username,
          avatarUrl: player1.avatarUrl || undefined,
          position: 'right',
          isAlive: true
        },
        targetNumber: null,
        isActive: true,
        countdownTimer: null,
        startTime: null
      };

      // إفراغ قائمة الانتظار (اللاعبان في اللعبة الآن)
      this.io.emit('players_waiting', {
        count: 0,
        players: []
      });

      // بدء المبارزة
      this.io.emit('game_started', {
        leftPlayer: this.getPublicPlayerData(this.currentGame.leftPlayer!),
        rightPlayer: this.getPublicPlayerData(this.currentGame.rightPlayer!)
      });

      console.log(`🎮 بدأت المبارزة: ${player1.username} (يمين) vs ${player2.username} (يسار)`);
      this.startCountdown();

    } catch (error) {
      console.error('❌ خطأ في بدء اللعبة:', error);
      this.resetGame();
    }
  }

  // 6. العد التنازلي مع مرحلة الاستعداد
  private startCountdown() {
    let count = 5;

    this.io.emit('countdown_tick', { seconds: count });
    console.log(`⏱️ العد التنازلي: ${count}`);

    this.currentGame.countdownTimer = setInterval(() => {
      if (count <= 1) {
        // مرحلة الاستعداد
        this.io.emit('game_ready');
        console.log(`🎯 مرحلة الاستعداد - اللاعبون مستعدون!`);

        if (this.currentGame.countdownTimer) clearInterval(this.currentGame.countdownTimer);

        // انتظار ثانية واحدة لمرحلة الاستعداد ثم توليد الرقم
        setTimeout(() => {
          this.generateTarget();
        }, 1000);

        return;
      } else {
        count--;
        this.io.emit('countdown_tick', { seconds: count });
        console.log(`⏱️ العد التنازلي: ${count}`);
      }
    }, 1000);
  }

  // 7. توليد الرقم الهدف
  private generateTarget() {
    const target = Math.floor(Math.random() * 9000) + 1000; // 1000-9999
    this.currentGame.targetNumber = target;
    this.currentGame.startTime = Date.now();

    this.io.emit('show_target', { number: target });
    console.log(`🎯 الهدف: ${target}`);
  }

  // 8. معالجة الإجابة (إطلاق النار)
  private async handleGameInput(playerId: string, numberInput: number) {
    if (!this.currentGame.isActive || !this.currentGame.targetNumber) return;

    const isLeft = this.currentGame.leftPlayer?.id === playerId;
    const isRight = this.currentGame.rightPlayer?.id === playerId;

    if (!isLeft && !isRight) return;

    console.log(`🔫 ${isLeft ? this.currentGame.leftPlayer?.username : this.currentGame.rightPlayer?.username} أطلق النار: ${numberInput}`);

    if (numberInput === this.currentGame.targetNumber) {
      // تحقق من أن اللعبة لا تزال نشطة (لمنع إطلاق النار مرتين)
      if (!this.currentGame.isActive) return;

      // في هذه اللعبة: اللاعب الذي يكتب الرقم أولاً يطلق النار ويموت، والخصم يفوز
      const shooter = isLeft ? this.currentGame.leftPlayer! : this.currentGame.rightPlayer!;
      const winner = isLeft ? this.currentGame.rightPlayer! : this.currentGame.leftPlayer!;
      const reactionTime = Date.now() - (this.currentGame.startTime || 0);

      this.currentGame.isActive = false;

      this.io.emit('shot_fired', {
        shooter: this.getPublicPlayerData(shooter),
        victim: this.getPublicPlayerData(shooter), // الذي أطلق النار يموت
        winner: this.getPublicPlayerData(winner),
        responseTime: reactionTime
      });

      console.log(`💥 ${shooter.username} أطلق النار ومات! ${winner.username} فاز في ${reactionTime}ms!`);

      // إعادة التعيين بعد 5 ثواني
      setTimeout(() => this.resetGame(), 5000);
    }
  }

  // 9. إعادة ضبط اللعبة
  async resetGame() {
    console.log("🔄 إعادة ضبط اللعبة...");

    // إعادة اللاعبين للحالة النشطة
    if (this.currentGame.leftPlayer) {
      await db.update(users)
        .set({ lobbyStatus: 'active' })
        .where(eq(users.externalId, this.currentGame.leftPlayer.id));
    }

    if (this.currentGame.rightPlayer) {
      await db.update(users)
        .set({ lobbyStatus: 'active' })
        .where(eq(users.externalId, this.currentGame.rightPlayer.id));
    }

    // تنظيف المؤقتات
    if (this.currentGame.countdownTimer) {
      clearInterval(this.currentGame.countdownTimer);
    }

    this.currentGame = {
      leftPlayer: null,
      rightPlayer: null,
      targetNumber: null,
      isActive: false,
      countdownTimer: null,
      startTime: null
    };

    this.io.emit('game_reset');

    // ✅ تحديث القائمة بعد إعادة اللاعبين
    const activePlayers = await db.query.users.findMany({
      where: eq(users.lobbyStatus, 'active')
    });

    this.io.emit('players_waiting', { 
      count: activePlayers.length,
      players: activePlayers.map(p => ({ 
        username: p.username, 
        avatarUrl: p.avatarUrl 
      }))
    });

    console.log(`✅ تمت إعادة الضبط - القائمة: ${activePlayers.length} لاعب`);

    // منع Auto-Start الفوري بعد إعادة الضبط لإعطاء فرصة للعبة الجديدة
    setTimeout(() => {
      if (activePlayers.length >= 2 && !this.currentGame.isActive) {
        console.log(`🎮 Auto-Start بعد إعادة الضبط: ${activePlayers.length} لاعبين`);
        this.startGameFromActivePlayers();
      }
    }, 1000);
  }

  // دالة مساعدة
  private getPublicPlayerData(player: Player) {
    return {
      id: player.id,
      username: player.username,
      avatarUrl: player.avatarUrl,
      position: player.position,
      isAlive: player.isAlive
    };
  }

  // إيقاف المراقبة
  stopMonitoring() {
    this.isMonitoring = false;
    if (this.currentGame.countdownTimer) {
      clearInterval(this.currentGame.countdownTimer);
    }
    console.log("🛑 تم إيقاف المراقبة");
  }

  // جلب الإحصائيات
  async getStats() {
    const activePlayers = await db.query.users.findMany({
      where: eq(users.lobbyStatus, 'active')
    });

    return {
      isActive: this.currentGame.isActive,
      players: [this.currentGame.leftPlayer, this.currentGame.rightPlayer].filter(Boolean),
      target: this.currentGame.targetNumber,
      waitingPlayersCount: activePlayers.length
    };
  }
}
