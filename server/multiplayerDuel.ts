import { Server } from "socket.io";

// Player interface
interface Player {
  id: string;
  username: string;
  position: 'left' | 'right';
  isAlive: boolean;
  socketId: string;
}

// Game state interface
interface GameState {
  status: 'waiting' | 'countdown' | 'ready' | 'active' | 'finished';
  players: Player[];
  targetNumber: number | null;
  winner: Player | null;
  countdown: number;
  startTime: number | null;
}

// Active players list
interface ActivePlayer {
  id: string;
  username: string;
  socketId: string;
}

export class MultiplayerDuelGame {
  private io: Server;
  private gameState: GameState;
  private activePlayers: ActivePlayer[];
  private countdownTimer: NodeJS.Timeout | null = null;

  constructor(io: Server) {
    this.io = io;
    this.gameState = {
      status: 'waiting',
      players: [],
      targetNumber: null,
      winner: null,
      countdown: 0,
      startTime: null
    };
    this.activePlayers = [];
    this.setupSocketListeners();
  }

  private setupSocketListeners() {
    this.io.on('connection', (socket) => {
      console.log(`Player connected: ${socket.id}`);

      // Handle player joining the active players list
      socket.on('join_game', (data: { username: string }) => {
        this.addPlayerToActiveList(socket.id, data.username);
      });

      // Handle player input during active duel
      socket.on('submit_number', (data: { number: number }) => {
        this.handlePlayerInput(socket.id, data.number);
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        this.removePlayerFromActiveList(socket.id);
        this.removePlayerFromGame(socket.id);
      });
    });
  }

  private addPlayerToActiveList(socketId: string, username: string) {
    // Remove existing entry if any
    this.activePlayers = this.activePlayers.filter(p => p.socketId !== socketId);

    // Add new player
    this.activePlayers.push({
      id: socketId,
      username,
      socketId
    });

    console.log(`Player ${username} joined active list. Total active: ${this.activePlayers.length}`);

    // Emit updated active players list
    this.io.emit('active_players_update', {
      players: this.activePlayers.map(p => ({ id: p.id, username: p.username }))
    });

    // Check if we can start matchmaking
    this.attemptMatchmaking();
  }

  private removePlayerFromActiveList(socketId: string) {
    this.activePlayers = this.activePlayers.filter(p => p.socketId !== socketId);
    this.io.emit('active_players_update', {
      players: this.activePlayers.map(p => ({ id: p.id, username: p.username }))
    });
  }

  private removePlayerFromGame(socketId: string) {
    if (this.gameState.status !== 'waiting') {
      this.gameState.players = this.gameState.players.filter(p => p.socketId !== socketId);
      // If a player disconnects during game, end the game
      if (this.gameState.players.length < 2) {
        this.endGame();
      }
    }
  }

  private attemptMatchmaking() {
    if (this.gameState.status !== 'waiting' || this.activePlayers.length < 2) {
      return;
    }

    console.log('Starting matchmaking...');

    // Select first 2 players from active list
    const player1 = this.activePlayers[0];
    const player2 = this.activePlayers[1];

    // Remove them from active list
    this.activePlayers = this.activePlayers.slice(2);

    // Setup game
    this.gameState.players = [
      {
        id: player1.id,
        username: player1.username,
        position: 'right', // Player 1 on right
        isAlive: true,
        socketId: player1.socketId
      },
      {
        id: player2.id,
        username: player2.username,
        position: 'left', // Player 2 on left
        isAlive: true,
        socketId: player2.socketId
      }
    ];

    this.gameState.status = 'countdown';
    this.gameState.countdown = 5;
    this.gameState.targetNumber = null;
    this.gameState.winner = null;
    this.gameState.startTime = null;

    // Notify players
    this.io.to(player1.socketId).emit('game_setup', {
      position: 'right',
      opponent: { username: player2.username }
    });

    this.io.to(player2.socketId).emit('game_setup', {
      position: 'left',
      opponent: { username: player1.username }
    });

    // Start countdown
    this.startCountdown();
  }

  private startCountdown() {
    this.gameState.countdown = 5;

    // Emit initial countdown
    this.io.emit('countdown_update', { countdown: this.gameState.countdown });

    this.countdownTimer = setInterval(() => {
      this.gameState.countdown--;

      if (this.gameState.countdown > 0) {
        this.io.emit('countdown_update', { countdown: this.gameState.countdown });
      } else {
        // Countdown finished, show READY
        this.io.emit('ready_signal');
        this.gameState.status = 'ready';

        // Clear countdown timer
        if (this.countdownTimer) {
          clearInterval(this.countdownTimer);
          this.countdownTimer = null;
        }

        // After READY, start the reaction task
        setTimeout(() => {
          this.startReactionTask();
        }, 1000); // 1 second delay after READY
      }
    }, 1000);
  }

  private startReactionTask() {
    // Generate random number (let's use 4-digit number like 1000-9999)
    const targetNumber = Math.floor(Math.random() * 9000) + 1000;
    this.gameState.targetNumber = targetNumber;
    this.gameState.status = 'active';
    this.gameState.startTime = Date.now();

    // Emit target number to all players
    this.io.emit('target_number', { number: targetNumber });
  }

  private handlePlayerInput(socketId: string, submittedNumber: number) {
    if (this.gameState.status !== 'active' || this.gameState.targetNumber === null) {
      return;
    }

    // Find the player
    const player = this.gameState.players.find(p => p.socketId === socketId);
    if (!player || !player.isAlive) {
      return;
    }

    // Check if correct number
    if (submittedNumber === this.gameState.targetNumber) {
      // Player wins
      this.gameState.winner = player;
      this.gameState.status = 'finished';

      // Calculate reaction time
      const reactionTime = this.gameState.startTime ? Date.now() - this.gameState.startTime : 0;

      // Determine winner and loser
      const winner = player;
      const loser = this.gameState.players.find(p => p.id !== player.id)!;

      // Emit game result
      this.io.emit('game_result', {
        winner: {
          id: winner.id,
          username: winner.username,
          position: winner.position,
          reactionTime
        },
        loser: {
          id: loser.id,
          username: loser.username,
          position: loser.position
        }
      });

      // Reset game after delay
      setTimeout(() => {
        this.resetGame();
      }, 5000); // 5 seconds to show result
    }
  }

  private endGame() {
    this.gameState.status = 'finished';
    this.io.emit('game_ended');

    // Reset after delay
    setTimeout(() => {
      this.resetGame();
    }, 3000);
  }

  private resetGame() {
    this.gameState = {
      status: 'waiting',
      players: [],
      targetNumber: null,
      winner: null,
      countdown: 0,
      startTime: null
    };

    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }

    this.io.emit('game_reset');
  }

  // Public method to get current game state
  public getGameState() {
    return {
      status: this.gameState.status,
      playerCount: this.activePlayers.length,
      isActive: this.gameState.status !== 'waiting'
    };
  }
}