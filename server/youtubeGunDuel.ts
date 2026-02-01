import { google, youtube_v3 } from "googleapis";
import { Server } from "socket.io";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

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

    // ✅ إرسال القائمة فور اتصال الشاشة
    this.io.on('connection', async (socket) => {
      console.log("🔌 شاشة جديدة اتصلت - إرسال البيانات...");

      try {
        // جلب اللاعبين النشطين (من لعبة القنبلة)
        const activePlayers = await db.query.users.findMany({
          where: eq(users.lobbyStatus, 'active')
        });

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
          const activePlayers = await db.query.users.findMany({
            where: eq(users.lobbyStatus, 'active')
          });

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

    setTimeout(() => this.pollChat(), 1500);
  }

  // 3. تحليل الرسالة
  private async processMessage(msg: youtube_v3.Schema$LiveChatMessage) {
    const text = msg.snippet?.displayMessage?.trim();
    const authorId = msg.authorDetails?.channelId;
    const authorName = msg.authorDetails?.displayName;
    const authorAvatar = msg.authorDetails?.profileImageUrl;

    if (!text || !authorId || !authorName) return;

    // ✅ الأمر: !دخول - إضافة للقائمة (مشترك مع لعبة القنبلة)
    if (text === "!دخول" || text.toLowerCase() === "!join") {
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

  // 4. ✅ إضافة لاعب للقائمة النشطة (مشترك مع لعبة القنبلة)
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
      const activePlayers = await db.query.users.findMany({
        where: eq(users.lobbyStatus, 'active')
      });

      // ✅ تحديث الواجهة (كل اللاعبين يظهرون في القائمة السفلية)
      this.io.emit('players_waiting', { 
        count: activePlayers.length,
        players: activePlayers.map(p => ({ 
          username: p.username, 
          avatarUrl: p.avatarUrl 
        }))
      });

      console.log(`📋 القائمة النشطة: ${activePlayers.length} لاعب`);

      // ✅ لا يوجد تشغيل تلقائي - ينتظر أمر !مبارزة أو زر من الواجهة

    } catch (error) {
      console.error('❌ خطأ في معالجة الانضمام:', error);
    }
  }

  // 5. ✅ بدء اللعبة من القائمة النشطة
  async startGameFromActivePlayers() {
    try {
      if (this.currentGame.isActive) {
        console.log("⚠️ هناك لعبة جارية بالفعل");
        return;
      }

      // جلب اللاعبين النشطين
      const activePlayers = await db.query.users.findMany({
        where: eq(users.lobbyStatus, 'active')
      });

      if (activePlayers.length < 2) {
        console.log(`⚠️ عدد اللاعبين غير كافٍ: ${activePlayers.length}/2`);
        this.io.emit('error_message', { 
          message: 'يجب وجود لاعبين على الأقل! (اكتب !دخول للانضمام)' 
        });
        return;
      }

      console.log(`🎲 اختيار لاعبين عشوائيين من ${activePlayers.length} لاعب...`);

      // 🎲 اختيار عشوائي
      const shuffled = [...activePlayers].sort(() => Math.random() - 0.5);
      const selected1 = shuffled[0];
      const selected2 = shuffled[1];

      console.log(`⚔️ تم الاختيار: ${selected1.username} vs ${selected2.username}`);

      // تحديث حالتهم إلى "في اللعبة"
      await db.update(users)
        .set({ lobbyStatus: 'in_game' })
        .where(eq(users.externalId, selected1.externalId!));

      await db.update(users)
        .set({ lobbyStatus: 'in_game' })
        .where(eq(users.externalId, selected2.externalId!));

      // إعداد اللعبة
      this.currentGame = {
        leftPlayer: { 
          id: selected1.externalId!, 
          username: selected1.username, 
          avatarUrl: selected1.avatarUrl || undefined, 
          position: 'left', 
          isAlive: true 
        },
        rightPlayer: { 
          id: selected2.externalId!, 
          username: selected2.username, 
          avatarUrl: selected2.avatarUrl || undefined, 
          position: 'right', 
          isAlive: true 
        },
        targetNumber: null,
        isActive: true,
        countdownTimer: null,
        startTime: null
      };

      // ✅ تحديث القائمة السفلية (إزالة المختارين)
      const remainingPlayers = activePlayers.filter(
        p => p.externalId !== selected1.externalId && p.externalId !== selected2.externalId
      );

      this.io.emit('players_waiting', { 
        count: remainingPlayers.length,
        players: remainingPlayers.map(p => ({ 
          username: p.username, 
          avatarUrl: p.avatarUrl 
        }))
      });

      // بدء المشهد
      this.io.emit('game_started', {
        leftPlayer: this.getPublicPlayerData(this.currentGame.leftPlayer!),
        rightPlayer: this.getPublicPlayerData(this.currentGame.rightPlayer!)
      });

      console.log(`🎮 بدأت المبارزة!`);
      this.startCountdown();

    } catch (error) {
      console.error('❌ خطأ في بدء اللعبة:', error);
      this.resetGame();
    }
  }

  // 6. العد التنازلي
  private startCountdown() {
    let count = 10;

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
