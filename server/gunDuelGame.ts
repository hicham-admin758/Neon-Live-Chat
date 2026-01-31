// server/gunDuelGame.ts
import { Server, Socket } from 'socket.io';

interface Player {
  id: number;
  username: string;
  avatarUrl?: string;
  socketId: string;
  position?: 'left' | 'right';
  isAlive: boolean;
}

interface GameSession {
  leftPlayer: Player | null;
  rightPlayer: Player | null;
  targetNumber: number | null;
  isActive: boolean;
  countdownTimer: NodeJS.Timeout | null;
  targetTimer: NodeJS.Timeout | null;
}

export class GunDuelGameManager {
  private io: Server;
  private waitingQueue: Player[] = [];
  private currentGame: GameSession = {
    leftPlayer: null,
    rightPlayer: null,
    targetNumber: null,
    isActive: false,
    countdownTimer: null,
    targetTimer: null
  };
  private chatMessageHandler: ((socket: Socket, message: string) => void) | null = null;

  constructor(io: Server) {
    this.io = io;
    this.setupSocketHandlers();
  }

  private setupSocketHandlers() {
    this.io.on('connection', (socket: Socket) => {
      console.log(`🎮 Player connected: ${socket.id}`);

      // 🎯 انضمام لاعب لقائمة الانتظار
      socket.on('join_queue', async () => {
        try {
          // الحصول على بيانات اللاعب من قاعدة البيانات
          const playerData = await this.getPlayerFromSocket(socket);
          
          if (!playerData) {
            socket.emit('error', { message: 'لم يتم العثور على بيانات اللاعب' });
            return;
          }

          // التحقق من عدم وجوده مسبقاً
          const alreadyInQueue = this.waitingQueue.some(p => p.id === playerData.id);
          if (alreadyInQueue) {
            socket.emit('error', { message: 'أنت بالفعل في قائمة الانتظار' });
            return;
          }

          // إضافة للقائمة
          this.waitingQueue.push(playerData);
          
          // إرسال تحديث لجميع المتصلين
          this.io.emit('players_waiting', { count: this.waitingQueue.length });

          console.log(`✅ ${playerData.username} انضم لقائمة الانتظار (${this.waitingQueue.length} لاعبين)`);

          // إذا كان هناك لاعبان أو أكثر، ابدأ اللعبة
          if (this.waitingQueue.length >= 2 && !this.currentGame.isActive) {
            setTimeout(() => this.startGame(), 2000);
          }
        } catch (error) {
          console.error('خطأ في join_queue:', error);
          socket.emit('error', { message: 'حدث خطأ أثناء الانضمام' });
        }
      });

      // 🔄 إعادة تعيين اللعبة
      socket.on('reset_game', () => {
        this.resetGame();
      });

      // 💬 معالجة رسائل الشات (يتم ربطها من الخارج)
      socket.on('chat_message', (message: string) => {
        if (this.chatMessageHandler) {
          this.chatMessageHandler(socket, message);
        }
      });

      // 🚪 عند مغادرة اللاعب
      socket.on('disconnect', () => {
        this.handlePlayerDisconnect(socket);
      });
    });
  }

  // 🎮 بدء اللعبة
  private async startGame() {
    if (this.waitingQueue.length < 2) {
      console.log('⚠️ لا يوجد لاعبان كافيان');
      return;
    }

    if (this.currentGame.isActive) {
      console.log('⚠️ اللعبة قيد التشغيل بالفعل');
      return;
    }

    // اختيار لاعبين عشوائياً
    const shuffled = [...this.waitingQueue].sort(() => Math.random() - 0.5);
    const leftPlayer = { ...shuffled[0], position: 'left' as const, isAlive: true };
    const rightPlayer = { ...shuffled[1], position: 'right' as const, isAlive: true };

    // إزالتهم من قائمة الانتظار
    this.waitingQueue = this.waitingQueue.filter(
      p => p.id !== leftPlayer.id && p.id !== rightPlayer.id
    );

    // تحديث حالة اللعبة
    this.currentGame = {
      leftPlayer,
      rightPlayer,
      targetNumber: null,
      isActive: true,
      countdownTimer: null,
      targetTimer: null
    };

    console.log(`🎮 بدء مبارزة: ${leftPlayer.username} vs ${rightPlayer.username}`);

    // إرسال بداية اللعبة لجميع المتصلين
    this.io.emit('game_started', {
      leftPlayer: this.getPublicPlayerData(leftPlayer),
      rightPlayer: this.getPublicPlayerData(rightPlayer)
    });

    // بدء العد التنازلي
    this.startCountdown();
  }

  // ⏱️ العد التنازلي
  private startCountdown() {
    let countdown = 10;

    this.currentGame.countdownTimer = setInterval(() => {
      this.io.emit('countdown_tick', { seconds: countdown });
      countdown--;

      if (countdown < 0) {
        if (this.currentGame.countdownTimer) {
          clearInterval(this.currentGame.countdownTimer);
          this.currentGame.countdownTimer = null;
        }
        this.showTarget();
      }
    }, 1000);
  }

  // 🎯 عرض الرقم المستهدف
  private showTarget() {
    // توليد رقم عشوائي من 10 إلى 99
    const targetNumber = Math.floor(Math.random() * 90) + 10;
    this.currentGame.targetNumber = targetNumber;

    console.log(`🎯 الرقم المستهدف: ${targetNumber}`);

    // إرسال الرقم لجميع المتصلين
    this.io.emit('show_target', { number: targetNumber });

    // الآن يجب مراقبة رسائل الشات
    this.setupChatMonitoring();
  }

  // 💬 مراقبة رسائل الشات
  private setupChatMonitoring() {
    this.chatMessageHandler = (socket: Socket, message: string) => {
      // إذا انتهت اللعبة، تجاهل
      if (!this.currentGame.isActive || !this.currentGame.targetNumber) {
        return;
      }

      // الحصول على بيانات اللاعب
      const player = this.getPlayerBySocketId(socket.id);
      if (!player) return;

      // التحقق من أن اللاعب في اللعبة الحالية
      if (
        this.currentGame.leftPlayer?.id !== player.id && 
        this.currentGame.rightPlayer?.id !== player.id
      ) {
        return;
      }

      // التحقق من الرسالة
      const trimmedMessage = message.trim();
      
      if (trimmedMessage === this.currentGame.targetNumber.toString()) {
        // اللاعب كتب الرقم الصحيح!
        this.handleCorrectAnswer(player);
      }
    };
  }

  // ✅ معالجة الإجابة الصحيحة
  private handleCorrectAnswer(winner: Player) {
    if (!this.currentGame.leftPlayer || !this.currentGame.rightPlayer) {
      return;
    }

    const victim = winner.id === this.currentGame.leftPlayer.id 
      ? this.currentGame.rightPlayer 
      : this.currentGame.leftPlayer;

    console.log(`💥 ${winner.username} أطلق النار على ${victim.username}!`);

    // إرسال حدث إطلاق النار
    this.io.emit('shot_fired', {
      shooter: this.getPublicPlayerData(winner),
      victim: this.getPublicPlayerData(victim)
    });

    // تحديث حالة اللعبة
    this.currentGame.isActive = false;
    this.chatMessageHandler = null;

    // مسح أي مؤقتات
    if (this.currentGame.countdownTimer) {
      clearInterval(this.currentGame.countdownTimer);
    }
    if (this.currentGame.targetTimer) {
      clearTimeout(this.currentGame.targetTimer);
    }
  }

  // 🔄 إعادة تعيين اللعبة
  public resetGame() {
    console.log('🔄 إعادة تعيين اللعبة');

    // مسح المؤقتات
    if (this.currentGame.countdownTimer) {
      clearInterval(this.currentGame.countdownTimer);
    }
    if (this.currentGame.targetTimer) {
      clearTimeout(this.currentGame.targetTimer);
    }

    // إعادة تعيين الحالة
    this.currentGame = {
      leftPlayer: null,
      rightPlayer: null,
      targetNumber: null,
      isActive: false,
      countdownTimer: null,
      targetTimer: null
    };

    this.chatMessageHandler = null;
    this.waitingQueue = [];

    // إرسال حدث إعادة التعيين
    this.io.emit('game_reset');
    this.io.emit('players_waiting', { count: 0 });
  }

  // 🚪 معالجة مغادرة اللاعب
  private handlePlayerDisconnect(socket: Socket) {
    console.log(`🚪 Player disconnected: ${socket.id}`);

    // إزالة من قائمة الانتظار
    const queueIndex = this.waitingQueue.findIndex(p => p.socketId === socket.id);
    if (queueIndex !== -1) {
      const player = this.waitingQueue[queueIndex];
      this.waitingQueue.splice(queueIndex, 1);
      console.log(`❌ ${player.username} غادر قائمة الانتظار`);
      this.io.emit('players_waiting', { count: this.waitingQueue.length });
    }

    // إذا كان في اللعبة الحالية
    if (this.currentGame.isActive) {
      if (
        this.currentGame.leftPlayer?.socketId === socket.id ||
        this.currentGame.rightPlayer?.socketId === socket.id
      ) {
        console.log('⚠️ لاعب في اللعبة النشطة غادر - إعادة تعيين اللعبة');
        this.resetGame();
      }
    }
  }

  // 🔍 الحصول على بيانات اللاعب من Socket
  private async getPlayerFromSocket(socket: Socket): Promise<Player | null> {
    try {
      // هنا يمكنك الحصول على بيانات اللاعب من قاعدة البيانات
      // مثال باستخدام session أو authentication token
      
      // للتجربة، سنستخدم بيانات وهمية:
      const userId = (socket.handshake.query.userId as string) || socket.id;
      const username = (socket.handshake.query.username as string) || `Player_${socket.id.substring(0, 5)}`;
      const avatarUrl = socket.handshake.query.avatarUrl as string | undefined;

      return {
        id: parseInt(userId) || Math.floor(Math.random() * 1000000),
        username,
        avatarUrl,
        socketId: socket.id,
        isAlive: true
      };
    } catch (error) {
      console.error('خطأ في getPlayerFromSocket:', error);
      return null;
    }
  }

  // 🔍 الحصول على لاعب من Socket ID
  private getPlayerBySocketId(socketId: string): Player | null {
    if (this.currentGame.leftPlayer?.socketId === socketId) {
      return this.currentGame.leftPlayer;
    }
    if (this.currentGame.rightPlayer?.socketId === socketId) {
      return this.currentGame.rightPlayer;
    }
    return this.waitingQueue.find(p => p.socketId === socketId) || null;
  }

  // 📝 الحصول على البيانات العامة للاعب (بدون socketId)
  private getPublicPlayerData(player: Player) {
    return {
      id: player.id,
      username: player.username,
      avatarUrl: player.avatarUrl,
      position: player.position,
      isAlive: player.isAlive
    };
  }

  // 📊 الحصول على حالة اللعبة الحالية
  public getGameState() {
    return {
      isActive: this.currentGame.isActive,
      waitingCount: this.waitingQueue.length,
      leftPlayer: this.currentGame.leftPlayer ? this.getPublicPlayerData(this.currentGame.leftPlayer) : null,
      rightPlayer: this.currentGame.rightPlayer ? this.getPublicPlayerData(this.currentGame.rightPlayer) : null
    };
  }

  // 💬 معالجة رسالة شات من الخارج (للتكامل مع نظام الشات الموجود)
  public handleChatMessage(socketId: string, message: string) {
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket && this.chatMessageHandler) {
      this.chatMessageHandler(socket, message);
    }
  }

  // 🧹 تنظيف الموارد
  public cleanup() {
    if (this.currentGame.countdownTimer) {
      clearInterval(this.currentGame.countdownTimer);
    }
    if (this.currentGame.targetTimer) {
      clearTimeout(this.currentGame.targetTimer);
    }
    this.waitingQueue = [];
    this.currentGame = {
      leftPlayer: null,
      rightPlayer: null,
      targetNumber: null,
      isActive: false,
      countdownTimer: null,
      targetTimer: null
    };
  }
}

// ============================================
// 📦 مثال على الاستخدام في Express + Socket.IO
// ============================================

/*
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { GunDuelGameManager } from './gunDuelGame';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// إنشاء مدير اللعبة
const gameManager = new GunDuelGameManager(io);

// مثال على ربط رسائل الشات
io.on('connection', (socket) => {
  socket.on('send_message', (message: string) => {
    // بث الرسالة لجميع المتصلين
    io.emit('new_message', {
      user: socket.id,
      message
    });
    
    // إرسال الرسالة لمدير اللعبة للتحقق
    gameManager.handleChatMessage(socket.id, message);
  });
});

// API للحصول على حالة اللعبة
app.get('/api/game/status', (req, res) => {
  res.json(gameManager.getGameState());
});

// API لإعادة تعيين اللعبة
app.post('/api/game/reset', (req, res) => {
  gameManager.resetGame();
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// تنظيف عند الإغلاق
process.on('SIGINT', () => {
  gameManager.cleanup();
  server.close();
  process.exit(0);
});
*/
