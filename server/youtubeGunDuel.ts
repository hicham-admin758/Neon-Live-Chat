// server/youtubeGunDuel.ts
import { Server, Socket } from 'socket.io';
import { google, youtube_v3 } from 'googleapis';
import { db } from './db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

interface Player {
  id: string;                    // YouTube Channel ID
  username: string;              // YouTube Display Name
  avatarUrl?: string;            // YouTube Profile Picture
  socketId?: string;             // Socket ID (للـ overlay فقط)
  position?: 'left' | 'right';
  isAlive: boolean;
}

interface GameSession {
  leftPlayer: Player | null;
  rightPlayer: Player | null;
  targetNumber: number | null;
  isActive: boolean;
  countdownTimer: NodeJS.Timeout | null;
  startTime: number | null;
}

export class YouTubeGunDuelGame {
  private io: Server;
  private youtube: youtube_v3.Youtube;
  private liveChatId: string | null = null;
  private nextPageToken: string | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;

  private currentGame: GameSession = {
    leftPlayer: null,
    rightPlayer: null,
    targetNumber: null,
    isActive: false,
    countdownTimer: null,
    startTime: null
  };

  // تتبع آخر رسالة لكل مستخدم لتجنب التكرار
  private lastMessageIds: Set<string> = new Set();

  constructor(io: Server, apiKey: string) {
    this.io = io;

    // إعداد YouTube API
    this.youtube = google.youtube({
      version: 'v3',
      auth: apiKey
    });

    this.setupSocketHandlers();
  }

  // 🎥 بدء مراقبة البث المباشر
  public async startMonitoring(broadcastId: string) {
    try {
      console.log(`🎥 بدء مراقبة البث: ${broadcastId}`);

      // الحصول على Live Chat ID
      const broadcast = await this.youtube.liveBroadcasts.list({
        part: ['snippet'],
        id: [broadcastId]
      });

      if (!broadcast.data.items || broadcast.data.items.length === 0) {
        throw new Error('لم يتم العثور على البث');
      }

      this.liveChatId = broadcast.data.items[0].snippet?.liveChatId || null;

      if (!this.liveChatId) {
        throw new Error('البث ليس مباشراً أو لا يحتوي على شات');
      }

      console.log(`✅ تم الاتصال بالشات: ${this.liveChatId}`);

      // بدء المراقبة
      this.startPolling();

      return { success: true, liveChatId: this.liveChatId };
    } catch (error) {
      console.error('❌ خطأ في بدء المراقبة:', error);
      throw error;
    }
  }

  // 🔄 مراقبة الشات بشكل دوري
  private async startPolling() {
    const pollChat = async () => {
      if (!this.liveChatId) return;

      try {
        const response = await this.youtube.liveChatMessages.list({
          liveChatId: this.liveChatId,
          part: ['snippet', 'authorDetails'],
          pageToken: this.nextPageToken || undefined,
          maxResults: 200
        });

        this.nextPageToken = response.data.nextPageToken || null;

        // معالجة الرسائل الجديدة
        if (response.data.items) {
          for (const item of response.data.items) {
            const messageId = item.id || '';

            // تجنب معالجة نفس الرسالة مرتين
            if (this.lastMessageIds.has(messageId)) continue;
            this.lastMessageIds.add(messageId);

            // الحد من حجم Set
            if (this.lastMessageIds.size > 1000) {
              const oldestIds = Array.from(this.lastMessageIds).slice(0, 500);
              oldestIds.forEach(id => this.lastMessageIds.delete(id));
            }

            await this.processMessage(item);
          }
        }

        // الانتظار قبل الطلب التالي (pollingIntervalMillis من الـ API)
        const pollInterval = response.data.pollingIntervalMillis || 5000;

        this.pollingInterval = setTimeout(pollChat, pollInterval);
      } catch (error) {
        console.error('❌ خطأ في قراءة الشات:', error);
        // إعادة المحاولة بعد 10 ثوانٍ
        this.pollingInterval = setTimeout(pollChat, 10000);
      }
    };

    pollChat();
  }

  // 💬 معالجة رسالة من الشات
  private async processMessage(message: youtube_v3.Schema$LiveChatMessage) {
    const text = message.snippet?.displayMessage?.trim() || '';
    const author = message.authorDetails;

    if (!author) return;

    const channelId = author.channelId || '';
    const displayName = author.displayName || 'Unknown';
    const profileImageUrl = author.profileImageUrl || undefined;

    console.log(`💬 ${displayName}: ${text}`);

    // 🎮 أمر الانضمام للعبة
    if (text.toLowerCase() === '!دخول' || text.toLowerCase() === '!join') {
      await this.handleJoinCommand(channelId, displayName, profileImageUrl);
    }
    // 🎯 إذا كانت اللعبة نشطة ويكتب رقم
    else if (this.currentGame.isActive && this.currentGame.targetNumber !== null) {
      await this.handleNumberGuess(channelId, displayName, text);
    }
  }

  // 🎮 معالجة أمر الانضمام
  private async handleJoinCommand(channelId: string, displayName: string, avatarUrl?: string) {
    try {
      // التحقق من عدم وجوده في اللعبة الحالية
      if (
        this.currentGame.leftPlayer?.id === channelId ||
        this.currentGame.rightPlayer?.id === channelId
      ) {
        console.log(`⚠️ ${displayName} يلعب حالياً`);
        return;
      }

      // إضافة أو تحديث اللاعب في قاعدة البيانات
      const existingUser = await db.query.users.findFirst({
        where: eq(users.externalId, channelId)
      });

      if (existingUser) {
        // تحديث حالة اللاعب إلى active
        await db.update(users)
          .set({ lobbyStatus: 'active' })
          .where(eq(users.externalId, channelId));

        console.log(`✅ ${displayName} عاد للعبة`);
      } else {
        // إضافة لاعب جديد
        await db.insert(users).values({
          username: displayName,
          avatarUrl: avatarUrl || null,
          externalId: channelId,
          lobbyStatus: 'active'
        });

        console.log(`✅ ${displayName} انضم لأول مرة`);
      }

      // الحصول على عدد اللاعبين النشطين
      const activePlayers = await db.query.users.findMany({
        where: eq(users.lobbyStatus, 'active')
      });

      // إرسال تحديث للواجهة
      this.io.emit('players_waiting', { 
        count: activePlayers.length,
        players: activePlayers.map(p => ({
          username: p.username,
          avatarUrl: p.avatarUrl
        }))
      });

      // إرسال حدث تحديث للـ LiveLobby
      this.io.emit('new_player');

      // إرسال رسالة في الشات
      if (this.liveChatId) {
        await this.sendChatMessage(`${displayName} انضم للعبة! 🎮 (${activePlayers.length} نشطين)`);
      }

      // إذا كان هناك لاعبان أو أكثر، ابدأ اللعبة
      if (activePlayers.length >= 2 && !this.currentGame.isActive) {
        setTimeout(() => this.startGame(), 3000);
      }
    } catch (error) {
      console.error('❌ خطأ في handleJoinCommand:', error);
    }
  }

  // 🎮 بدء اللعبة - تم التحديث: اختيار عشوائي من قاعدة البيانات
  private async startGame() {
    try {
      if (this.currentGame.isActive) {
        console.log('⚠️ لعبة نشطة بالفعل');
        return;
      }

      // 🔍 الحصول على اللاعبين النشطين من قاعدة البيانات
      const activePlayers = await db.query.users.findMany({
        where: eq(users.lobbyStatus, 'active')
      });

      if (activePlayers.length < 2) {
        console.log(`⚠️ لا يوجد لاعبين كافيين (${activePlayers.length})`);
        return;
      }

      // 🎲 اختيار لاعبين عشوائياً
      const shuffled = [...activePlayers].sort(() => Math.random() - 0.5);
      const selected1 = shuffled[0];
      const selected2 = shuffled[1];

      // تحويل لاعبي قاعدة البيانات إلى Player objects
      const leftPlayer: Player = {
        id: selected1.externalId!,
        username: selected1.username,
        avatarUrl: selected1.avatarUrl || undefined,
        position: 'left',
        isAlive: true
      };

      const rightPlayer: Player = {
        id: selected2.externalId!,
        username: selected2.username,
        avatarUrl: selected2.avatarUrl || undefined,
        position: 'right',
        isAlive: true
      };

      // تحديث حالة اللاعبين في قاعدة البيانات
      await db.update(users)
        .set({ lobbyStatus: 'in_game' })
        .where(eq(users.externalId, selected1.externalId!));

      await db.update(users)
        .set({ lobbyStatus: 'in_game' })
        .where(eq(users.externalId, selected2.externalId!));

      this.currentGame = {
        leftPlayer,
        rightPlayer,
        targetNumber: null,
        isActive: true,
        countdownTimer: null,
        startTime: null
      };

      console.log(`⚔️ مبارزة عشوائية: ${leftPlayer.username} vs ${rightPlayer.username}`);

      // حساب المتبقين
      const remaining = activePlayers.length - 2;
      console.log(`📊 متبقي في القائمة: ${remaining} لاعبين`);

      // إرسال للـ overlay
      this.io.emit('game_started', {
        leftPlayer: this.getPublicPlayerData(leftPlayer),
        rightPlayer: this.getPublicPlayerData(rightPlayer)
      });

      // إرسال تحديث اللاعبين
      this.io.emit('player_eliminated');

      // إرسال رسالة في الشات
      if (this.liveChatId) {
        await this.sendChatMessage(
          `⚔️ مبارزة جديدة! ${leftPlayer.username} 🆚 ${rightPlayer.username} 🎯`
        );
      }

      // بدء العد التنازلي
      this.startCountdown();
    } catch (error) {
      console.error('❌ خطأ في startGame:', error);
    }
  }

  // ⏱️ العد التنازلي
  private startCountdown() {
    let countdown = 10;

    const tick = async () => {
      this.io.emit('countdown_tick', { seconds: countdown });

      // رسالة في الشات عند 5 ثوانٍ
      if (countdown === 5 && this.liveChatId) {
        await this.sendChatMessage('⏰ 5 ثوانٍ متبقية... استعدوا! 🔫');
      }

      countdown--;

      if (countdown < 0) {
        this.showTarget();
      } else {
        this.currentGame.countdownTimer = setTimeout(tick, 1000);
      }
    };

    tick();
  }

  // 🎯 عرض الرقم المستهدف
  private async showTarget() {
    const targetNumber = Math.floor(Math.random() * 90) + 10;
    this.currentGame.targetNumber = targetNumber;
    this.currentGame.startTime = Date.now();

    console.log(`🎯 الرقم المستهدف: ${targetNumber}`);

    this.io.emit('show_target', { number: targetNumber });

    // رسالة في الشات
    if (this.liveChatId) {
      await this.sendChatMessage(
        `🎯 الرقم هو: ${targetNumber} - اكتبه بسرعة! ⚡`
      );
    }
  }

  // 🎯 معالجة تخمين الرقم
  private async handleNumberGuess(channelId: string, displayName: string, text: string) {
    if (!this.currentGame.isActive || !this.currentGame.targetNumber) return;

    // التحقق من أن اللاعب في اللعبة
    const player = 
      this.currentGame.leftPlayer?.id === channelId ? this.currentGame.leftPlayer :
      this.currentGame.rightPlayer?.id === channelId ? this.currentGame.rightPlayer :
      null;

    if (!player) return;

    // التحقق من الإجابة
    const guess = text.trim();

    if (guess === this.currentGame.targetNumber.toString()) {
      const responseTime = this.currentGame.startTime 
        ? Date.now() - this.currentGame.startTime 
        : 0;

      console.log(`🎯 ${displayName} كتب الرقم الصحيح! (${responseTime}ms)`);

      await this.handleWin(player, responseTime);
    }
  }

  // 🏆 معالجة الفوز
  private async handleWin(winner: Player, responseTime: number) {
    if (!this.currentGame.leftPlayer || !this.currentGame.rightPlayer) return;

    const loser = winner.id === this.currentGame.leftPlayer.id 
      ? this.currentGame.rightPlayer 
      : this.currentGame.leftPlayer;

    console.log(`💥 ${winner.username} فاز! ${loser.username} خسر!`);

    try {
      // إعادة الخاسر إلى القائمة النشطة
      await db.update(users)
        .set({ lobbyStatus: 'active' })
        .where(eq(users.externalId, loser.id));

      // إزالة الفائز من القائمة (تصفيته)
      await db.delete(users)
        .where(eq(users.externalId, winner.id));

      console.log(`✅ ${loser.username} عاد للقائمة النشطة`);
      console.log(`❌ ${winner.username} تمت تصفيته`);

    } catch (error) {
      console.error('❌ خطأ في تحديث قاعدة البيانات:', error);
    }

    // إرسال للـ overlay
    this.io.emit('shot_fired', {
      shooter: this.getPublicPlayerData(winner),
      victim: this.getPublicPlayerData(loser),
      responseTime
    });

    // إرسال تحديث للـ LiveLobby
    this.io.emit('player_eliminated');

    // رسالة في الشات
    if (this.liveChatId) {
      await this.sendChatMessage(
        `🎉 ${winner.username} فاز بالمبارزة! 💥 ${loser.username} يعود للقائمة`
      );
    }

    // إنهاء اللعبة
    this.currentGame.isActive = false;

    // مسح المؤقتات
    if (this.currentGame.countdownTimer) {
      clearTimeout(this.currentGame.countdownTimer);
    }

    // التحقق من وجود لاعبين آخرين وبدء لعبة جديدة
    setTimeout(async () => {
      try {
        const activePlayers = await db.query.users.findMany({
          where: eq(users.lobbyStatus, 'active')
        });

        if (activePlayers.length >= 2) {
          console.log(`🔄 بدء لعبة جديدة... (${activePlayers.length} لاعبين نشطين)`);
          this.startGame();
        } else {
          console.log(`⏳ في انتظار المزيد من اللاعبين... (${activePlayers.length} حالياً)`);
        }
      } catch (error) {
        console.error('❌ خطأ في التحقق من اللاعبين:', error);
      }
    }, 10000);
  }

  // 💬 إرسال رسالة في شات اليوتيوب
  private async sendChatMessage(text: string) {
    if (!this.liveChatId) return;

    try {
      await this.youtube.liveChatMessages.insert({
        part: ['snippet'],
        requestBody: {
          snippet: {
            liveChatId: this.liveChatId,
            type: 'textMessageEvent',
            textMessageDetails: {
              messageText: text
            }
          }
        }
      });
    } catch (error) {
      console.error('❌ خطأ في إرسال رسالة:', error);
    }
  }

  // 🔄 إعادة تعيين اللعبة
  public async resetGame() {
    console.log('🔄 إعادة تعيين اللعبة');

    if (this.currentGame.countdownTimer) {
      clearTimeout(this.currentGame.countdownTimer);
    }

    try {
      // إعادة اللاعبين الحاليين إلى القائمة النشطة
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

      console.log('✅ تم إعادة اللاعبين للقائمة النشطة');
    } catch (error) {
      console.error('❌ خطأ في إعادة تعيين قاعدة البيانات:', error);
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

    if (this.liveChatId) {
      await this.sendChatMessage('🔄 تمت إعادة تعيين اللعبة! اكتب !دخول للانضمام 🎮');
    }

    // التحقق من وجود لاعبين للعبة جديدة
    try {
      const activePlayers = await db.query.users.findMany({
        where: eq(users.lobbyStatus, 'active')
      });

      if (activePlayers.length >= 2) {
        setTimeout(() => this.startGame(), 3000);
      }
    } catch (error) {
      console.error('❌ خطأ في التحقق من اللاعبين:', error);
    }
  }

  // 🛑 إيقاف المراقبة
  public stopMonitoring() {
    console.log('🛑 إيقاف المراقبة');

    if (this.pollingInterval) {
      clearTimeout(this.pollingInterval);
      this.pollingInterval = null;
    }

    if (this.currentGame.countdownTimer) {
      clearTimeout(this.currentGame.countdownTimer);
    }

    this.liveChatId = null;
    this.nextPageToken = null;
    this.lastMessageIds.clear();
  }

  // 🔌 إعداد Socket handlers
  private setupSocketHandlers() {
    this.io.on('connection', async (socket: Socket) => {
      console.log(`🔌 Overlay connected: ${socket.id}`);

      try {
        // إرسال الحالة الحالية من قاعدة البيانات
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
        console.error('❌ خطأ في جلب اللاعبين:', error);
      }

      if (this.currentGame.isActive) {
        socket.emit('game_started', {
          leftPlayer: this.currentGame.leftPlayer ? this.getPublicPlayerData(this.currentGame.leftPlayer) : null,
          rightPlayer: this.currentGame.rightPlayer ? this.getPublicPlayerData(this.currentGame.rightPlayer) : null
        });
      }

      // أوامر إدارية
      socket.on('admin_reset', () => {
        this.resetGame();
      });

      socket.on('admin_clear_queue', async () => {
        try {
          // حذف جميع اللاعبين من قاعدة البيانات
          await db.delete(users);
          this.io.emit('players_waiting', { count: 0, players: [] });
          this.io.emit('new_player'); // تحديث LiveLobby
          console.log('✅ تم تصفير قائمة اللاعبين');
        } catch (error) {
          console.error('❌ خطأ في تصفير القائمة:', error);
        }
      });

      socket.on('disconnect', () => {
        console.log(`🔌 Overlay disconnected: ${socket.id}`);
      });
    });
  }

  // 📝 البيانات العامة
  private getPublicPlayerData(player: Player) {
    return {
      id: player.id,
      username: player.username,
      avatarUrl: player.avatarUrl,
      position: player.position,
      isAlive: player.isAlive
    };
  }

  // 📊 الحصول على الإحصائيات
  public async getStats() {
    try {
      const activePlayers = await db.query.users.findMany({
        where: eq(users.lobbyStatus, 'active')
      });

      return {
        isMonitoring: this.liveChatId !== null,
        liveChatId: this.liveChatId,
        waitingCount: activePlayers.length,
        isGameActive: this.currentGame.isActive,
        currentPlayers: {
          left: this.currentGame.leftPlayer?.username || null,
          right: this.currentGame.rightPlayer?.username || null
        }
      };
    } catch (error) {
      console.error('❌ خطأ في getStats:', error);
      return {
        isMonitoring: this.liveChatId !== null,
        liveChatId: this.liveChatId,
        waitingCount: 0,
        isGameActive: this.currentGame.isActive,
        currentPlayers: {
          left: this.currentGame.leftPlayer?.username || null,
          right: this.currentGame.rightPlayer?.username || null
        }
      };
    }
  }
}

// ============================================
// 📦 مثال الاستخدام
// ============================================

/*
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { YouTubeGunDuelGame } from './youtubeGunDuel';

const app = express();
const server = createServer(app);
const io = new Server(server);

// YouTube API Key - احصل عليه من Google Cloud Console
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || 'YOUR_API_KEY';

const game = new YouTubeGunDuelGame(io, YOUTUBE_API_KEY);

// API لبدء المراقبة
app.post('/api/youtube/start', async (req, res) => {
  const { broadcastId } = req.body;

  try {
    const result = await game.startMonitoring(broadcastId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API لإيقاف المراقبة
app.post('/api/youtube/stop', (req, res) => {
  game.stopMonitoring();
  res.json({ success: true });
});

// API للإحصائيات
app.get('/api/youtube/stats', (req, res) => {
  res.json(game.getStats());
});

// API لإعادة التعيين
app.post('/api/youtube/reset', async (req, res) => {
  await game.resetGame();
  res.json({ success: true });
});

server.listen(3000, () => {
  console.log('🚀 Server running on port 3000');
});
*/
