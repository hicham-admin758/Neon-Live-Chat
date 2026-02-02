import { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

// Game state types
interface Player {
  id: string;
  username: string;
  position: 'left' | 'right';
  isAlive: boolean;
}

interface ActivePlayer {
  id: string;
  username: string;
}

interface GameResult {
  winner: {
    id: string;
    username: string;
    position: 'left' | 'right';
    reactionTime: number;
  };
  loser: {
    id: string;
    username: string;
    position: 'left' | 'right';
  };
}

export default function MultiplayerDuel() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [username, setUsername] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [activePlayers, setActivePlayers] = useState<ActivePlayer[]>([]);
  const [gameState, setGameState] = useState<'waiting' | 'setup' | 'countdown' | 'ready' | 'active' | 'finished'>('waiting');
  const [countdown, setCountdown] = useState(0);
  const [targetNumber, setTargetNumber] = useState<number | null>(null);
  const [inputNumber, setInputNumber] = useState("");
  const [myPosition, setMyPosition] = useState<'left' | 'right' | null>(null);
  const [opponent, setOpponent] = useState<{ username: string } | null>(null);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [winner, setWinner] = useState<Player | null>(null);
  const [loser, setLoser] = useState<Player | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Connect to socket
    const newSocket = io();
    setSocket(newSocket);

    // Socket event listeners
    newSocket.on('connect', () => {
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    newSocket.on('active_players_update', (data: { players: ActivePlayer[] }) => {
      setActivePlayers(data.players);
    });

    newSocket.on('game_setup', (data: { position: 'left' | 'right', opponent: { username: string } }) => {
      setMyPosition(data.position);
      setOpponent(data.opponent);
      setGameState('setup');
    });

    newSocket.on('countdown_update', (data: { countdown: number }) => {
      setCountdown(data.countdown);
      setGameState('countdown');
    });

    newSocket.on('ready_signal', () => {
      setGameState('ready');
    });

    newSocket.on('target_number', (data: { number: number }) => {
      setTargetNumber(data.number);
      setGameState('active');
      // Focus input when target appears
      setTimeout(() => inputRef.current?.focus(), 100);
    });

    newSocket.on('game_result', (data: GameResult) => {
      setGameResult(data);
      setWinner(data.winner);
      setLoser(data.loser);
      setGameState('finished');
    });

    newSocket.on('game_reset', () => {
      resetGame();
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const joinGame = () => {
    if (socket && username.trim()) {
      socket.emit('join_game', { username: username.trim() });
      setIsJoined(true);
    }
  };

  const submitNumber = () => {
    if (socket && inputNumber && gameState === 'active') {
      const num = parseInt(inputNumber);
      if (!isNaN(num)) {
        socket.emit('submit_number', { number: num });
        setInputNumber("");
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      submitNumber();
    }
  };

  const resetGame = () => {
    setGameState('waiting');
    setCountdown(0);
    setTargetNumber(null);
    setInputNumber("");
    setMyPosition(null);
    setOpponent(null);
    setGameResult(null);
    setWinner(null);
    setLoser(null);
  };

  const leaveGame = () => {
    if (socket) {
      socket.disconnect();
    }
    setIsJoined(false);
    resetGame();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        {/* Connection Status */}
        <div className="text-center mb-8">
          <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
            isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}>
            <div className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
            {isConnected ? 'متصل' : 'غير متصل'}
          </div>
        </div>

        {/* Join Game */}
        {!isJoined && (
          <Card className="p-8 bg-black/50 border-purple-500/50">
            <h2 className="text-2xl font-bold text-white text-center mb-6">انضم للعبة المبارزة</h2>
            <div className="flex gap-4 max-w-md mx-auto">
              <Input
                type="text"
                placeholder="اسم المستخدم"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="flex-1"
                onKeyPress={(e) => e.key === 'Enter' && joinGame()}
              />
              <Button onClick={joinGame} disabled={!username.trim() || !isConnected}>
                انضم
              </Button>
            </div>
          </Card>
        )}

        {/* Active Players List */}
        {isJoined && gameState === 'waiting' && (
          <Card className="p-8 bg-black/50 border-purple-500/50 mb-8">
            <h3 className="text-xl font-bold text-white text-center mb-4">اللاعبون في قائمة الانتظار</h3>
            <div className="text-center text-gray-300">
              {activePlayers.length} لاعب في الانتظار...
            </div>
            <div className="text-center mt-4">
              <Button onClick={leaveGame} variant="outline">
                خروج
              </Button>
            </div>
          </Card>
        )}

        {/* Game Setup */}
        {gameState === 'setup' && (
          <Card className="p-8 bg-black/50 border-purple-500/50 mb-8">
            <h3 className="text-xl font-bold text-white text-center mb-4">تم إقرانك مع لاعب!</h3>
            <div className="text-center text-gray-300">
              موقعك: <span className="text-purple-400 font-bold">{myPosition === 'right' ? 'اليمين' : 'اليسار'}</span>
            </div>
            <div className="text-center text-gray-300 mt-2">
              الخصم: <span className="text-red-400 font-bold">{opponent?.username}</span>
            </div>
          </Card>
        )}

        {/* Countdown */}
        {gameState === 'countdown' && (
          <div className="text-center mb-8">
            <div className="text-8xl font-bold text-yellow-400 animate-pulse">
              {countdown}
            </div>
          </div>
        )}

        {/* Ready */}
        {gameState === 'ready' && (
          <div className="text-center mb-8">
            <div className="text-6xl font-bold text-green-400 animate-bounce">
              جاهز!
            </div>
          </div>
        )}

        {/* Active Game */}
        {gameState === 'active' && targetNumber && (
          <Card className="p-8 bg-black/50 border-purple-500/50 mb-8">
            <div className="text-center mb-6">
              <div className="text-6xl font-bold text-cyan-400 mb-4">
                {targetNumber}
              </div>
              <p className="text-gray-300">اكتب الرقم أولاً للفوز!</p>
            </div>
            <div className="flex gap-4 max-w-md mx-auto">
              <Input
                ref={inputRef}
                type="number"
                placeholder="اكتب الرقم هنا"
                value={inputNumber}
                onChange={(e) => setInputNumber(e.target.value)}
                onKeyPress={handleKeyPress}
                className="flex-1 text-center text-2xl"
                autoFocus
              />
              <Button onClick={submitNumber} disabled={!inputNumber}>
                إرسال
              </Button>
            </div>
          </Card>
        )}

        {/* Game Result */}
        {gameState === 'finished' && gameResult && (
          <Card className="p-8 bg-black/50 border-purple-500/50 mb-8">
            <div className="text-center">
              <h3 className="text-3xl font-bold text-white mb-4">
                {winner?.id === socket?.id ? 'فزت! 🎉' : 'خسرت 😢'}
              </h3>
              <div className="text-xl text-gray-300 mb-2">
                الفائز: <span className="text-green-400 font-bold">{gameResult.winner.username}</span>
              </div>
              <div className="text-xl text-gray-300 mb-2">
                الخاسر: <span className="text-red-400 font-bold">{gameResult.loser.username}</span>
              </div>
              <div className="text-lg text-gray-400">
                وقت التفاعل: {gameResult.winner.reactionTime}ms
              </div>
            </div>
          </Card>
        )}

        {/* Game Over Actions */}
        {gameState === 'finished' && (
          <div className="text-center">
            <Button onClick={leaveGame} variant="outline">
              خروج من اللعبة
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}