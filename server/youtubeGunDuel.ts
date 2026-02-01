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

    // ✅ إصلاح التزامن: إرسال القائمة فور اتصال الشاشة
    this.io.on('connection', async (socket) => {
      try {
        const activePlayers = await db.query.users.findMany({
          where: eq(users.lobbyStatus, 'active')
        });

        // إرسال البيانات للشاشة الجديدة فقط
        socket.emit('players_waiting', { 
          count: activePlayers.length, 
          players: activePlayers.map(p => ({ username: p.username, avatarUrl: p.avatarUrl })) 
        });

        // إرسال حالة اللعبة الحالية إذا كانت جارية
        if (this.currentGame.isActive && this.currentGame.leftPlayer && this.currentGame.rightPlayer) {
            socket.emit('game_started', {
                leftPlayer: this.getPublicPlayerData(this.currentGame.leftPlayer),
                rightPlayer: this.getPublicPlayerData(this.currentGame.rightPlayer)
            });
        }

      } catch (error) {
        console.error('❌ خطأ في مزامنة الشاشة عند الاتصال:', error);
      }
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
      this.pollChat(); // بدء التكرار

      return { liveChatId: this.liveChatId };
    } catch (error) {
      console.error("Error starting monitoring:", error);
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

      // معالجة الرسائل الجديدة
      for (const msg of messages) {
        await this.processMessage(msg);
      }

    } catch (error) {
      console.error("Error polling chat:", error);
    }

    // تكرار العملية كل ثانية ونصف
    setTimeout(() => this.pollChat(), 1500);
  }

  // 3. تحليل الرسالة
  private async processMessage(msg: youtube_v3.Schema$LiveChatMessage) {
    const text = msg.snippet?.displayMessage?.trim();
    const authorId = msg.authorDetails?.channelId;
    const authorName = msg.authorDetails?.displayName;
    const authorAvatar = msg.authorDetails?.profileImageUrl;

    if (!text || !authorId || !authorName) return;

    // الأمر: !دخول
    if (text === "!دخول" || text.toLowerCase() === "!join") {
      await this.handleJoinCommand(authorId, authorName, authorAvatar || undefined);
    }

    // الأمر: محاولة الإجابة (رقم)
    if (this.currentGame.isActive && this.currentGame.targetNumber !== null) {
        const parsedNumber = parseInt(text);
        if (!isNaN(parsedNumber)) {
            await this.handleGameInput(authorId, parsedNumber);
        }
    }
  }

  // 4. منطق الانضمام والسحب العشوائي
  private async handleJoinCommand(channelId: string, displayName: string, avatarUrl?: string) {
    try {
      // تجاهل اللاعبين الموجودين داخل الحلبة حالياً
      if (this.currentGame.leftPlayer?.id === channelId || this.currentGame.rightPlayer?.id === channelId) {
        return;
      }

      // إضافة/تحديث اللاعب في قاعدة البيانات
      const existingUser = await db.query.users.findFirst({
        where: eq(users.externalId, channelId)
      });

      if (existingUser) {
        await db.update(users).set({ lobbyStatus: 'active' }).where(eq(users.externalId, channelId));
      } else {
        await db.insert(users).values({
          username: displayName,
          avatarUrl: avatarUrl || null,
          externalId: channelId,
          lobbyStatus: 'active'
        });
      }

      // جلب القائمة المحدثة
      const activePlayers = await db.query.users.findMany({
        where: eq(users.lobbyStatus, 'active')
      });

      // تحديث الواجهة
      this.io.emit('players_waiting', { 
        count: activePlayers.length,
        players: activePlayers.map(p => ({ username: p.username, avatarUrl: p.avatarUrl }))
      });
      this.io.emit('new_player'); 

      console.log(`✅ ${displayName} انضم للقائمة. العدد: ${activePlayers.length}`);

      // 🔥 التشغيل التلقائي إذا توفر لاعبين
      if (activePlayers.length >= 2 && !this.currentGame.isActive) {
        console.log("🎲 العدد اكتمل، جاري السحب العشوائي...");
        // مهلة قصيرة جداً لضمان ظهور اللاعب الأخير في القائمة قبل سحبه
        setTimeout(() => this.startGame(), 1500); 
      }
    } catch (error) {
      console.error('❌ خطأ في معالجة الانضمام:', error);
    }
  }

  // 5. بدء اللعبة واختيار اللاعبين
  private async startGame() {
    try {
      if (this.currentGame.isActive) return;

      // سحب اللاعبين النشطين
      const activePlayers = await db.query.users.findMany({
        where: eq(users.lobbyStatus, 'active')
      });

      if (activePlayers.length < 2) return;

      // 🎲 الخلط العشوائي (Shuffle)
      const shuffled = [...activePlayers].sort(() => Math.random() - 0.5);
      const selected1 = shuffled[0];
      const selected2 = shuffled[1];

      // تحديث حالتهم إلى "في اللعبة" لإزالتهم من القائمة السفلية
      await db.update(users).set({ lobbyStatus: 'in_game' }).where(eq(users.externalId, selected1.externalId!));
      await db.update(users).set({ lobbyStatus: 'in_game' }).where(eq(users.externalId, selected2.externalId!));

      // إعداد اللعبة
      this.currentGame = {
        leftPlayer: { id: selected1.externalId!, username: selected1.username, avatarUrl: selected1.avatarUrl || undefined, position: 'left', isAlive: true },
        rightPlayer: { id: selected2.externalId!, username: selected2.username, avatarUrl: selected2.avatarUrl || undefined, position: 'right', isAlive: true },
        targetNumber: null,
        isActive: true,
        countdownTimer: null,
        startTime: null
      };

      // تحديث القائمة السفلية (إزالة المختارين)
      const remainingPlayers = activePlayers.filter(p => p.externalId !== selected1.externalId && p.externalId !== selected2.externalId);
      this.io.emit('players_waiting', { 
        count: remainingPlayers.length,
        players: remainingPlayers.map(p => ({ username: p.username, avatarUrl: p.avatarUrl }))
      });

      // بدء المشهد
      this.io.emit('game_started', {
        leftPlayer: this.getPublicPlayerData(this.currentGame.leftPlayer!),
        rightPlayer: this.getPublicPlayerData(this.currentGame.rightPlayer!)
      });

      console.log(`⚔️ بدأت بين: ${selected1.username} vs ${selected2.username}`);
      this.startCountdown();

    } catch (error) {
      console.error('❌ خطأ في بدء اللعبة:', error);
      this.resetGame();
    }
  }

  // 6. العد التنازلي
  private startCountdown() {
    let count = 10;

    // إرسال العد الأولي
    this.io.emit('countdown_tick', { seconds: count });

    this.currentGame.countdownTimer = setInterval(() => {
      count--;
      this.io.emit('countdown_tick', { seconds: count });

      if (count <= 0) {
        if (this.currentGame.countdownTimer) clearInterval(this.currentGame.countdownTimer);
        this.generateTarget();
      }
    }, 1000);
  }

  // 7. توليد الرقم الهدف
  private generateTarget() {
    const target = Math.floor(Math.random() * 9000) + 1000; // رقم بين 1000 و 9999
    this.currentGame.targetNumber = target;
    this.currentGame.startTime = Date.now();

    this.io.emit('show_target', { number: target });
    console.log(`🎯 الهدف هو: ${target}`);
  }

  // 8. معالجة الإجابة (إطلاق النار)
  private async handleGameInput(playerId: string, numberInput: number) {
    if (!this.currentGame.isActive || !this.currentGame.targetNumber) return;

    // التأكد من أن اللاعب هو أحد المتنافسين
    const isLeft = this.currentGame.leftPlayer?.id === playerId;
    const isRight = this.currentGame.rightPlayer?.id === playerId;

    if (!isLeft && !isRight) return;

    // التحقق من صحة الرقم
    if (numberInput === this.currentGame.targetNumber) {
        const winner = isLeft ? this.currentGame.leftPlayer! : this.currentGame.rightPlayer!;
        const loser = isLeft ? this.currentGame.rightPlayer! : this.currentGame.leftPlayer!;
        const reactionTime = Date.now() - (this.currentGame.startTime || 0);

        // إنهاء اللعبة
        this.currentGame.isActive = false;

        this.io.emit('shot_fired', {
            shooter: this.getPublicPlayerData(winner),
            victim: this.getPublicPlayerData(loser),
            responseTime: reactionTime
        });

        // تحديث قاعدة البيانات (إحصائيات الفوز) - اختياري
        // يمكن إضافة كود هنا لزيادة عدد الانتصارات في جدول المستخدمين

        // إعادة التعيين بعد 5 ثواني
        setTimeout(() => this.resetGame(), 5000);
    }
  }

  // 9. إعادة ضبط اللعبة
  async resetGame() {
    // إعادة اللاعبين للحالة "خامل" أو إبقاؤهم خارج القائمة حسب رغبتك
    // هنا سنعيدهم للحالة العادية ليتمكنوا من كتابة !دخول مرة أخرى إذا أرادوا اللعب

    // تنظيف المؤقتات
    if (this.currentGame.countdownTimer) clearInterval(this.currentGame.countdownTimer);

    this.currentGame = {
      leftPlayer: null,
      rightPlayer: null,
      targetNumber: null,
      isActive: false,
      countdownTimer: null,
      startTime: null
    };

    this.io.emit('game_reset');

    // التحقق مما إذا كان هناك لاعبون في الانتظار لبدء جولة جديدة فوراً
    const activePlayers = await db.query.users.findMany({
        where: eq(users.lobbyStatus, 'active')
    });

    if (activePlayers.length >= 2) {
        setTimeout(() => this.startGame(), 2000);
    }
  }

  // دالة مساعدة لتنسيق البيانات المرسلة
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
    if (this.currentGame.countdownTimer) clearInterval(this.currentGame.countdownTimer);
  }

  // جلب الإحصائيات (لواجهة التحكم)
  async getStats() {
    return {
        isActive: this.currentGame.isActive,
        players: [this.currentGame.leftPlayer, this.currentGame.rightPlayer].filter(Boolean),
        target: this.currentGame.targetNumber
    };
  }
}
