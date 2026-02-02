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

      // ✅ معالجة طلب بدء اللعبة من الواجهة
      socket.on('start_gun_duel', async () => {
        console.log("🎯 تم طلب بدء لعبة المسدسات من الواجهة");
        await this.startGameFromActivePlayers();
      });

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

        // تأخير بسيط (ثانيتين) قبل البدء لإعطاء فرصة للمزيد من اللاعبين للانضمام
        setTimeout(async () => {
          // تحقق مرة أخرى من أن اللعبة لم تبدأ في هذه الأثناء
          if (!this.currentGame.isActive) {
            await this.startGameFromActivePlayers();
          }
        }, 2000);
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

      // جلب المتابعين النشطين (الذين كتبوا !دخول)
      const activeFollowers = await storage.getUsers();

      if (activeFollowers.length < 2) {
        console.log(`⚠️ عدد المتابعين غير كافٍ: ${activeFollowers.length}/2`);
        this.io.emit('error_message', { 
          message: 'يجب وجود متابعين على الأقل! (اكتب !دخول للانضمام)' 
        });
        return;
      }

      console.log(`🎲 اختيار متابعين عشوائيين من ${activeFollowers.length} متابع...`);

      // 🎲 اختيار عشوائي للأهداف
      const shuffled = [...activeFollowers].sort(() => Math.random() - 0.5);
      const target1 = shuffled[0]; // هدف على اليسار
      const target2 = shuffled[1]; // هدف على اليمين

      console.log(`🎯 تم اختيار الأهداف: ${target1.username} (يسار) vs ${target2.username} (يمين)`);

      // تحديث حالتهم إلى "في اللعبة"
      await db.update(users)
        .set({ lobbyStatus: 'in_game' })
        .where(eq(users.externalId, target1.externalId!));

      await db.update(users)
        .set({ lobbyStatus: 'in_game' })
        .where(eq(users.externalId, target2.externalId!));

      // إعداد اللعبة مع الأهداف
      this.currentGame = {
        leftPlayer: { 
          id: target1.externalId!, 
          username: target1.username, 
          avatarUrl: target1.avatarUrl || undefined, 
          position: 'left', 
          isAlive: true 
        },
        rightPlayer: { 
          id: target2.externalId!, 
          username: target2.username, 
          avatarUrl: target2.avatarUrl || undefined, 
          position: 'right', 
          isAlive: true 
        },
        targetNumber: null,
        isActive: true,
        countdownTimer: null,
        startTime: null
      };

      // ✅ تحديث القائمة السفلية (إزالة الأهداف المختارة)
      const remainingFollowers = activeFollowers.filter(
        f => f.externalId !== target1.externalId && f.externalId !== target2.externalId
      );

      this.io.emit('players_waiting', { 
        count: remainingFollowers.length,
        players: remainingFollowers.map(f => ({ 
          username: f.username, 
          avatarUrl: f.avatarUrl 
        }))
      });

      // بدء المشهد مع الأهداف
      this.io.emit('game_started', {
        leftPlayer: this.getPublicPlayerData(this.currentGame.leftPlayer!),
        rightPlayer: this.getPublicPlayerData(this.currentGame.rightPlayer!)
      });

      console.log(`🎮 بدأت المبارزة! الأهداف: ${target1.username} vs ${target2.username}`);
      this.startCountdown();

    } catch (error) {
      console.error('❌ خطأ في بدء اللعبة:', error);
      this.resetGame();
    }
  }

  // 6. العد التنازلي
  private startCountdown() {
    let count = 5;

    this.io.emit('countdown_tick', { seconds: count });
    console.log(`⏱️ العد التنازلي: ${count}`);

    this.currentGame.countdownTimer = setInterval(() => {
      count--;
      this.io.emit('countdown_tick', { seconds: count });
      console.log(`⏱️ العد التنازلي: ${count}`);

      if (count <= 0) {
        if (this.currentGame.countdownTimer) clearInterval(this.currentGame.countdownTimer);
        this.generateTarget();
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

      const winner = isLeft ? this.currentGame.leftPlayer! : this.currentGame.rightPlayer!;
      const loser = isLeft ? this.currentGame.rightPlayer! : this.currentGame.leftPlayer!;
      const reactionTime = Date.now() - (this.currentGame.startTime || 0);

      this.currentGame.isActive = false;

      this.io.emit('shot_fired', {
        shooter: this.getPublicPlayerData(winner),
        victim: this.getPublicPlayerData(loser),
        responseTime: reactionTime
      });

      console.log(`🏆 ${winner.username} فاز في ${reactionTime}ms!`);

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
