// server/youtubeGunDuel.ts
import { Server, Socket } from 'socket.io';
import { google, youtube_v3 } from 'googleapis';

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
  
  private waitingQueue: Player[] = [];
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
  // تتبع اللاعبين الذين انضموا
  private joinedPlayers: Set<string> = new Set();

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
    // التحقق من أنه لم ينضم مسبقاً
    if (this.joinedPlayers.has(channelId)) {
      console.log(`⚠️ ${displayName} حاول الانضمام مرة أخرى`);
      return;
    }

    // التحقق من عدم وجوده في قائمة الانتظار
    const alreadyInQueue = this.waitingQueue.some(p => p.id === channelId);
    if (alreadyInQueue) {
      console.log(`⚠️ ${displayName} بالفعل في قائمة الانتظار`);
      return;
    }

    // التحقق من أنه ليس في اللعبة الحالية
    if (
      this.currentGame.leftPlayer?.id === channelId ||
      this.currentGame.rightPlayer?.id === channelId
    ) {
      console.log(`⚠️ ${displayName} يلعب حالياً`);
      return;
    }

    // إضافة للقائمة
    const player: Player = {
      id: channelId,
      username: displayName,
      avatarUrl,
      isAlive: true
    };

    this.waitingQueue.push(player);
    this.joinedPlayers.add(channelId);

    console.log(`✅ ${displayName} انضم لقائمة الانتظار (${this.waitingQueue.length} لاعبين)`);

    // إرسال تحديث
    this.io.emit('players_waiting', { 
      count: this.waitingQueue.length,
      players: this.waitingQueue.map(p => ({
        username: p.username,
        avatarUrl: p.avatarUrl
      }))
    });

    // إرسال رسالة في الشات (اختياري)
    if (this.liveChatId) {
      await this.sendChatMessage(`${displayName} انضم للعبة! 🎮 (${this.waitingQueue.length} في الانتظار)`);
    }

    // إذا كان هناك لاعبان، ابدأ اللعبة
    if (this.waitingQueue.length >= 2 && !this.currentGame.isActive) {
      setTimeout(() => this.startGame(), 3000);
    }
  }

  // 🎮 بدء اللعبة
  private async startGame() {
    if (this.waitingQueue.length < 2) return;
    if (this.currentGame.isActive) return;

    // اختيار أول لاعبين من القائمة (FIFO)
    const leftPlayer = { ...this.waitingQueue[0], position: 'left' as const, isAlive: true };
    const rightPlayer = { ...this.waitingQueue[1], position: 'right' as const, isAlive: true };

    // إزالتهم من قائمة الانتظار
    this.waitingQueue = this.waitingQueue.slice(2);

    this.currentGame = {
      leftPlayer,
      rightPlayer,
      targetNumber: null,
      isActive: true,
      countdownTimer: null,
      startTime: null
    };

    console.log(`⚔️ مبارزة: ${leftPlayer.username} vs ${rightPlayer.username}`);

    // إرسال للـ overlay
    this.io.emit('game_started', {
      leftPlayer: this.getPublicPlayerData(leftPlayer),
      rightPlayer: this.getPublicPlayerData(rightPlayer)
    });

    // إرسال رسالة في الشات
    if (this.liveChatId) {
      await this.sendChatMessage(
        `⚔️ مبارزة جديدة! ${leftPlayer.username} 🆚 ${rightPlayer.username} 🎯`
      );
    }

    // بدء العد التنازلي
    this.startCountdown();
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

    const victim = winner.id === this.currentGame.leftPlayer.id 
      ? this.currentGame.rightPlayer 
      : this.currentGame.leftPlayer;

    console.log(`💥 ${winner.username} فاز! (${responseTime}ms)`);

    // إرسال للـ overlay
    this.io.emit('shot_fired', {
      shooter: this.getPublicPlayerData(winner),
      victim: this.getPublicPlayerData(victim),
      responseTime
    });

    // رسالة في الشات
    if (this.liveChatId) {
      await this.sendChatMessage(
        `🎉 ${winner.username} فاز بالمبارزة! 💥 (${(responseTime / 1000).toFixed(2)} ثانية)`
      );
    }

    // إنهاء اللعبة
    this.currentGame.isActive = false;

    // مسح المؤقتات
    if (this.currentGame.countdownTimer) {
      clearTimeout(this.currentGame.countdownTimer);
    }

    // إزالة اللاعبين من قائمة الانضمام بعد 10 ثوانٍ
    setTimeout(() => {
      if (this.currentGame.leftPlayer) {
        this.joinedPlayers.delete(this.currentGame.leftPlayer.id);
      }
      if (this.currentGame.rightPlayer) {
        this.joinedPlayers.delete(this.currentGame.rightPlayer.id);
      }

      // إذا كان هناك لاعبون في الانتظار، ابدأ لعبة جديدة
      if (this.waitingQueue.length >= 2) {
        this.startGame();
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

    // حفظ اللاعبين الحاليين
    const currentPlayers = [this.currentGame.leftPlayer, this.currentGame.rightPlayer]
      .filter(p => p !== null) as Player[];

    // إزالتهم من قائمة الانضمام
    currentPlayers.forEach(p => this.joinedPlayers.delete(p.id));

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

    // إذا كان هناك لاعبون في الانتظار، ابدأ لعبة جديدة
    if (this.waitingQueue.length >= 2) {
      setTimeout(() => this.startGame(), 3000);
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
    this.joinedPlayers.clear();
    this.waitingQueue = [];
  }

  // 🔌 إعداد Socket handlers
  private setupSocketHandlers() {
    this.io.on('connection', (socket: Socket) => {
      console.log(`🔌 Overlay connected: ${socket.id}`);

      // إرسال الحالة الحالية
      socket.emit('players_waiting', { 
        count: this.waitingQueue.length,
        players: this.waitingQueue.map(p => ({
          username: p.username,
          avatarUrl: p.avatarUrl
        }))
      });

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

      socket.on('admin_clear_queue', () => {
        this.waitingQueue = [];
        this.joinedPlayers.clear();
        this.io.emit('players_waiting', { count: 0, players: [] });
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
  public getStats() {
    return {
      isMonitoring: this.liveChatId !== null,
      liveChatId: this.liveChatId,
      waitingCount: this.waitingQueue.length,
      isGameActive: this.currentGame.isActive,
      currentPlayers: {
        left: this.currentGame.leftPlayer?.username || null,
        right: this.currentGame.rightPlayer?.username || null
      }
    };
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