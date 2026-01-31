// server/gunDuelGame.ts
import { Server, Socket } from 'socket.io';

interface Player {
  id: string;
  username: string;
  avatarUrl?: string;
  socketId: string;
}

interface GameSession {
  player1: Player;
  player2: Player;
  targetNumber: number;
  startTime: number;
  countdown: NodeJS.Timeout | null;
  numberRevealTimeout: NodeJS.Timeout | null;
}

class GunDuelGameServer {
  private io: Server;
  private waitingPlayers: Player[] = [];
  private currentGame: GameSession | null = null;
  private chatMessages: Array<{ username: string; message: string; timestamp: number }> = [];

  constructor(io: Server) {
    this.io = io;
    this.setupSocketHandlers();
  }

  private setupSocketHandlers() {
    this.io.on('connection', (socket: Socket) => {
      console.log('🎮 لاعب متصل:', socket.id);

      // إرسال معلومات المستخدم (يمكن دمجها مع نظام المصادقة الخاص بك)
      const currentUser: Player = {
        id: socket.id,
        username: `Player_${Math.floor(Math.random() * 1000)}`,
        socketId: socket.id
      };

      socket.emit('current-user', currentUser);

      // إرسال قائمة المنتظرين الحالية
      this.broadcastWaitingPlayers();

      // إرسال رسائل الشات السابقة
      socket.emit('chat-history', this.chatMessages.slice(-50)); // آخر 50 رسالة

      // استقبال رسائل الشات
      socket.on('send-chat-message', (message: string) => {
        const chatMessage = {
          username: currentUser.username,
          message: message,
          timestamp: Date.now()
        };

        this.chatMessages.push(chatMessage);

        // بث الرسالة لجميع المتصلين
        this.io.emit('chat-message', chatMessage);

        // التحقق إذا كانت الرسالة "دخول" للانضمام للعبة
        if (message.trim() === 'دخول') {
          this.handleJoinDuel(socket, currentUser);
        }
      });

      // الانضمام للعبة عبر الزر
      socket.on('join-duel', () => {
        this.handleJoinDuel(socket, currentUser);
      });

      // إرسال الرقم
      socket.on('submit-number', (number: number) => {
        this.handleNumberSubmit(socket, currentUser, number);
      });

      // قطع الاتصال
      socket.on('disconnect', () => {
        console.log('❌ لاعب انقطع:', socket.id);

        // إزالة من قائمة الانتظار
        this.waitingPlayers = this.waitingPlayers.filter(p => p.socketId !== socket.id);
        this.broadcastWaitingPlayers();

        // إلغاء اللعبة الحالية إذا كان أحد اللاعبين
        if (this.currentGame) {
          if (this.currentGame.player1.socketId === socket.id || 
              this.currentGame.player2.socketId === socket.id) {
            this.cancelCurrentGame();
          }
        }
      });
    });
  }

  private handleJoinDuel(socket: Socket, player: Player) {
    // التحقق من عدم وجوده في قائمة الانتظار
    if (this.waitingPlayers.some(p => p.socketId === socket.id)) {
      socket.emit('error', { message: 'أنت بالفعل في قائمة الانتظار' });
      return;
    }

    // التحقق من عدم وجود لعبة حالية
    if (this.currentGame) {
      socket.emit('error', { message: 'هناك لعبة قائمة حالياً، انتظر انتهائها' });
      return;
    }

    // إضافة للقائمة
    this.waitingPlayers.push(player);
    this.broadcastWaitingPlayers();

    console.log(`✅ ${player.username} انضم للانتظار`);

    // إذا أصبح لدينا لاعبان، ابدأ اللعبة
    if (this.waitingPlayers.length >= 2) {
      this.startGame();
    }
  }

  private startGame() {
    if (this.waitingPlayers.length < 2) return;

    // اختيار أول لاعبين
    const player1 = this.waitingPlayers.shift()!;
    const player2 = this.waitingPlayers.shift()!;

    // إنشاء رقم عشوائي (من 0 إلى 99)
    const targetNumber = Math.floor(Math.random() * 100);

    this.currentGame = {
      player1,
      player2,
      targetNumber,
      startTime: Date.now(),
      countdown: null,
      numberRevealTimeout: null
    };

    console.log(`🎮 بدأت اللعبة: ${player1.username} ضد ${player2.username}`);

    // إرسال بداية اللعبة لجميع المتصلين
    this.io.emit('game-started', {
      player1: {
        id: player1.id,
        username: player1.username,
        avatarUrl: player1.avatarUrl
      },
      player2: {
        id: player2.id,
        username: player2.username,
        avatarUrl: player2.avatarUrl
      }
    });

    // بث رسالة في الشات
    const gameStartMessage = {
      username: 'النظام',
      message: `🎮 بدأت مبارزة بين ${player1.username} و ${player2.username}!`,
      timestamp: Date.now()
    };
    this.chatMessages.push(gameStartMessage);
    this.io.emit('chat-message', gameStartMessage);

    // بدء العد التنازلي
    this.startCountdown();
  }

  private startCountdown() {
    if (!this.currentGame) return;

    let seconds = 10;

    // إرسال أول تحديث
    this.io.emit('countdown-tick', seconds);

    this.currentGame.countdown = setInterval(() => {
      seconds--;

      if (seconds > 0) {
        this.io.emit('countdown-tick', seconds);
      } else {
        // انتهى العد التنازلي، أظهر الرقم
        if (this.currentGame?.countdown) {
          clearInterval(this.currentGame.countdown);
          this.currentGame.countdown = null;
        }
        this.revealNumber();
      }
    }, 1000);
  }

  private revealNumber() {
    if (!this.currentGame) return;

    console.log(`🎯 تم الكشف عن الرقم: ${this.currentGame.targetNumber}`);

    // إرسال الرقم لجميع المتصلين
    this.io.emit('number-revealed', this.currentGame.targetNumber);

    // رسالة في الشات
    const numberMessage = {
      username: 'النظام',
      message: `🎯 ظهر الرقم! من سيكون الأسرع؟`,
      timestamp: Date.now()
    };
    this.chatMessages.push(numberMessage);
    this.io.emit('chat-message', numberMessage);
  }

  private handleNumberSubmit(socket: Socket, player: Player, number: number) {
    if (!this.currentGame) return;

    // التحقق من أن اللاعب في اللعبة
    const isPlayer1 = this.currentGame.player1.socketId === socket.id;
    const isPlayer2 = this.currentGame.player2.socketId === socket.id;

    if (!isPlayer1 && !isPlayer2) {
      socket.emit('error', { message: 'أنت لست في اللعبة الحالية' });
      return;
    }

    // التحقق من صحة الرقم
    if (number === this.currentGame.targetNumber) {
      // فاز اللاعب!
      const winner = isPlayer1 ? this.currentGame.player1 : this.currentGame.player2;
      const loser = isPlayer1 ? this.currentGame.player2 : this.currentGame.player1;
      const shootDirection = isPlayer1 ? 'right' : 'left';

      console.log(`🏆 ${winner.username} فاز!`);

      // إرسال نتيجة اللعبة
      this.io.emit('game-finished', {
        winner: {
          id: winner.id,
          username: winner.username,
          avatarUrl: winner.avatarUrl
        },
        loser: {
          id: loser.id,
          username: loser.username,
          avatarUrl: loser.avatarUrl
        },
        shootDirection
      });

      // رسالة في الشات
      const winMessage = {
        username: 'النظام',
        message: `🏆 ${winner.username} فاز بالمبارزة! 🎉`,
        timestamp: Date.now()
      };
      this.chatMessages.push(winMessage);
      this.io.emit('chat-message', winMessage);

      // تنظيف اللعبة
      this.cleanupCurrentGame();

      // إذا كان هناك لاعبون في الانتظار، ابدأ لعبة جديدة بعد 7 ثوان
      setTimeout(() => {
        if (this.waitingPlayers.length >= 2) {
          this.startGame();
        }
      }, 7000);

    } else {
      // رقم خاطئ
      socket.emit('error', { message: `❌ رقم خاطئ! الرقم الصحيح: ${this.currentGame.targetNumber}` });
    }
  }

  private cancelCurrentGame() {
    if (!this.currentGame) return;

    console.log('⚠️ تم إلغاء اللعبة الحالية');

    // تنظيف المؤقتات
    if (this.currentGame.countdown) {
      clearInterval(this.currentGame.countdown);
    }
    if (this.currentGame.numberRevealTimeout) {
      clearTimeout(this.currentGame.numberRevealTimeout);
    }

    // إرسال رسالة الإلغاء
    const cancelMessage = {
      username: 'النظام',
      message: '⚠️ تم إلغاء اللعبة بسبب انقطاع أحد اللاعبين',
      timestamp: Date.now()
    };
    this.chatMessages.push(cancelMessage);
    this.io.emit('chat-message', cancelMessage);

    this.currentGame = null;

    // إعادة تعيين الحالة
    this.io.emit('game-reset');
  }

  private cleanupCurrentGame() {
    if (!this.currentGame) return;

    if (this.currentGame.countdown) {
      clearInterval(this.currentGame.countdown);
    }
    if (this.currentGame.numberRevealTimeout) {
      clearTimeout(this.currentGame.numberRevealTimeout);
    }

    this.currentGame = null;
  }

  private broadcastWaitingPlayers() {
    const playerNames = this.waitingPlayers.map(p => p.username);
    this.io.emit('waiting-players-update', playerNames);
  }

  // API للإحصائيات (اختياري)
  public getStats() {
    return {
      waitingPlayers: this.waitingPlayers.length,
      hasActiveGame: this.currentGame !== null,
      totalMessages: this.chatMessages.length
    };
  }
}

export default GunDuelGameServer;


// ========================
// مثال الاستخدام في server.ts الرئيسي
// ========================

/*
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import GunDuelGameServer from './gunDuelGame';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// تهيئة لعبة المبارزة
const gunDuelGame = new GunDuelGameServer(io);

// API للإحصائيات (اختياري)
app.get('/api/game/stats', (req, res) => {
  res.json(gunDuelGame.getStats());
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
*/
