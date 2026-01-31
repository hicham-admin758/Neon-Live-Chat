// components/YouTubeGunDuelOverlay.tsx
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Target, Trophy, Skull, Crown, Zap } from "lucide-react";
import { io, Socket } from "socket.io-client";

// 🎮 أنواع البيانات
interface Player {
  id: string;
  username: string;
  avatarUrl?: string;
  position: 'left' | 'right';
  isAlive: boolean;
}

interface GameState {
  isWaiting: boolean;
  isCountdown: boolean;
  isPlaying: boolean;
  isFinished: boolean;
  targetNumber: number | null;
  winner: Player | null;
  leftPlayer: Player | null;
  rightPlayer: Player | null;
  countdown: number;
  waitingCount: number;
  responseTime?: number;
}

// 🔊 أصوات اللعبة
const SOUNDS = {
  gunshot: "https://assets.mixkit.co/active_storage/sfx/2914/2914-preview.mp3",
  victory: "https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3",
  countdown: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3",
  playerJoin: "https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3",
  death: "https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3"
};

// 🎨 مكون: بطاقة اللاعب
const PlayerCard = ({ 
  player, 
  position, 
  shotFired,
  isDead 
}: { 
  player: Player | null; 
  position: 'left' | 'right';
  shotFired: boolean;
  isDead: boolean;
}) => {
  if (!player) {
    return (
      <div className="flex flex-col items-center gap-4 opacity-30">
        <div className="w-40 h-40 rounded-full border-4 border-dashed border-white/20 flex items-center justify-center">
          <div className="text-6xl">👤</div>
        </div>
        <p className="text-white/40 font-bold text-xl">في الانتظار...</p>
      </div>
    );
  }

  return (
    <motion.div 
      className="flex flex-col items-center gap-5 relative"
      initial={{ opacity: 0, x: position === 'left' ? -100 : 100 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* 👤 صورة اللاعب */}
      <div className={`
        relative w-40 h-40 rounded-full border-4 transition-all duration-300
        ${isDead 
          ? 'border-red-600 grayscale opacity-50' 
          : 'border-cyan-400 shadow-[0_0_40px_rgba(34,211,238,0.6)]'
        }
      `}>
        {/* تأثير الانفجار */}
        {isDead && (
          <motion.div
            className="absolute inset-0 bg-red-500 rounded-full"
            initial={{ scale: 1, opacity: 0.8 }}
            animate={{ scale: 3, opacity: 0 }}
            transition={{ duration: 0.6 }}
          />
        )}

        <div className="w-full h-full rounded-full overflow-hidden bg-gradient-to-br from-gray-800 to-black">
          {player.avatarUrl ? (
            <img 
              src={player.avatarUrl} 
              alt={player.username} 
              className="w-full h-full object-cover"
              crossOrigin="anonymous"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-5xl font-black text-white">
              {player.username[0].toUpperCase()}
            </div>
          )}
        </div>

        {/* جمجمة عند الموت */}
        {isDead && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Skull size={70} className="text-red-600 drop-shadow-2xl" />
          </motion.div>
        )}

        {/* تاج الفائز */}
        {!isDead && player.isAlive && (
          <motion.div
            className="absolute -top-12 left-1/2 -translate-x-1/2"
            initial={{ y: -20, opacity: 0, rotate: -20 }}
            animate={{ y: 0, opacity: 1, rotate: 0 }}
            transition={{ delay: 1, duration: 0.5 }}
          >
            <Crown size={60} className="text-yellow-400 fill-yellow-400 drop-shadow-lg animate-bounce" />
          </motion.div>
        )}
      </div>

      {/* 🏷️ اسم اللاعب */}
      <div className={`
        px-6 py-3 rounded-full border-2 font-black text-2xl backdrop-blur-md shadow-2xl
        ${isDead 
          ? 'bg-red-900/70 border-red-600 text-red-200' 
          : 'bg-cyan-900/70 border-cyan-400 text-cyan-100'
        }
      `}>
        {player.username}
      </div>

      {/* 🔫 المسدس */}
      <motion.div
        className={`text-8xl ${position === 'left' ? 'scale-x-[-1]' : ''}`}
        animate={shotFired ? { 
          x: position === 'left' ? 40 : -40,
          rotate: position === 'left' ? -25 : 25,
          scale: 1.4
        } : {}}
        transition={{ duration: 0.2 }}
      >
        🔫
      </motion.div>

      {/* 💥 تأثير إطلاق النار */}
      <AnimatePresence>
        {shotFired && (
          <motion.div
            className={`absolute top-1/2 ${position === 'left' ? 'right-0' : 'left-0'}`}
            initial={{ scale: 0, x: position === 'left' ? 20 : -20 }}
            animate={{ scale: [1, 2.5, 0], x: position === 'left' ? 120 : -120 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="text-8xl">💥</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// 🎮 المكون الرئيسي
export default function YouTubeGunDuelOverlay() {
  const [gameState, setGameState] = useState<GameState>({
    isWaiting: true,
    isCountdown: false,
    isPlaying: false,
    isFinished: false,
    targetNumber: null,
    winner: null,
    leftPlayer: null,
    rightPlayer: null,
    countdown: 10,
    waitingCount: 0
  });

  const [shotFired, setShotFired] = useState<'left' | 'right' | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const audioCache = useRef<Map<string, HTMLAudioElement>>(new Map());

  // 🔊 تحميل الأصوات
  useEffect(() => {
    Object.entries(SOUNDS).forEach(([key, url]) => {
      const audio = new Audio(url);
      audio.preload = "auto";
      audio.volume = 0.7;
      audioCache.current.set(key, audio);
    });
  }, []);

  // 🎵 تشغيل الصوت
  const playSound = (soundKey: keyof typeof SOUNDS) => {
    try {
      const audio = audioCache.current.get(soundKey);
      if (audio) {
        const clone = audio.cloneNode() as HTMLAudioElement;
        clone.volume = 0.7;
        clone.play().catch(() => {});
      }
    } catch (e) {
      console.warn("Sound play failed:", e);
    }
  };

  // 🌐 إعداد Socket.IO
  useEffect(() => {
    const socket = io(window.location.origin, { 
      path: "/socket.io",
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000
    });

    socketRef.current = socket;

    // 👥 تحديث عدد المنتظرين
    socket.on("players_waiting", ({ count }: { count: number }) => {
      setGameState(prev => ({ ...prev, waitingCount: count }));
    });

    // 🎮 بداية اللعبة
    socket.on("game_started", ({ leftPlayer, rightPlayer }: { 
      leftPlayer: Player; 
      rightPlayer: Player; 
    }) => {
      playSound("playerJoin");

      setGameState(prev => ({
        ...prev,
        isWaiting: false,
        isCountdown: true,
        leftPlayer,
        rightPlayer,
        countdown: 10
      }));
    });

    // ⏱️ العد التنازلي
    socket.on("countdown_tick", ({ seconds }: { seconds: number }) => {
      setGameState(prev => ({ ...prev, countdown: seconds }));

      if (seconds <= 3) {
        playSound("countdown");
      }
    });

    // 🎯 ظهور الرقم
    socket.on("show_target", ({ number }: { number: number }) => {
      setGameState(prev => ({
        ...prev,
        isCountdown: false,
        isPlaying: true,
        targetNumber: number
      }));
    });

    // 💥 إطلاق النار
    socket.on("shot_fired", ({ 
      shooter, 
      victim,
      responseTime 
    }: { 
      shooter: Player; 
      victim: Player;
      responseTime?: number;
    }) => {
      playSound("gunshot");
      setShotFired(shooter.position);

      setTimeout(() => {
        playSound("death");

        setGameState(prev => ({
          ...prev,
          isPlaying: false,
          isFinished: true,
          winner: shooter,
          responseTime,
          [victim.position === 'left' ? 'leftPlayer' : 'rightPlayer']: {
            ...victim,
            isAlive: false
          }
        }));
      }, 500);

      setTimeout(() => {
        playSound("victory");
      }, 1000);
    });

    // 🔄 إعادة تعيين
    socket.on("game_reset", () => {
      setGameState({
        isWaiting: true,
        isCountdown: false,
        isPlaying: false,
        isFinished: false,
        targetNumber: null,
        winner: null,
        leftPlayer: null,
        rightPlayer: null,
        countdown: 10,
        waitingCount: 0
      });
      setShotFired(null);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div className="w-screen h-screen bg-transparent flex items-center justify-center relative overflow-hidden">

      {/* 🎨 خلفية شبه شفافة */}
      <div className="absolute inset-0 bg-gradient-to-br from-black/40 via-transparent to-black/40"></div>

      <div className="relative z-10 w-full max-w-7xl px-8">

        {/* 🎯 عنوان اللعبة */}
        <motion.div 
          className="text-center mb-12"
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
        >
          <div className="flex items-center justify-center gap-4 mb-4">
            <Target className="text-red-500" size={60} />
            <h1 className="text-7xl font-black text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.5)]">
              مبارزة المسدسات
            </h1>
            <Target className="text-red-500" size={60} />
          </div>

          {/* عداد المنتظرين */}
          {gameState.isWaiting && gameState.waitingCount > 0 && (
            <motion.div
              className="mt-4 px-8 py-3 bg-cyan-600/80 backdrop-blur-md rounded-full inline-block border-2 border-cyan-400"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <p className="text-white text-2xl font-black">
                👥 {gameState.waitingCount} لاعبين في الانتظار
              </p>
            </motion.div>
          )}
        </motion.div>

        {/* 🎮 منطقة اللعب */}
        <div className="grid grid-cols-3 gap-12 items-center">

          {/* لاعب يسار */}
          <div className="flex justify-center">
            <PlayerCard 
              player={gameState.leftPlayer} 
              position="left"
              shotFired={shotFired === 'left'}
              isDead={gameState.leftPlayer ? !gameState.leftPlayer.isAlive : false}
            />
          </div>

          {/* 🎯 المنطقة الوسطى */}
          <div className="flex flex-col items-center justify-center gap-8">

            {/* حالة الانتظار */}
            {gameState.isWaiting && (
              <motion.div 
                className="text-center"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
              >
                <div className="w-48 h-48 rounded-full border-4 border-dashed border-white/30 flex flex-col items-center justify-center animate-spin-slow mb-6 bg-black/40 backdrop-blur-md">
                  <div className="text-7xl mb-2">🎮</div>
                  <div className="text-white text-xl font-bold animate-pulse">اكتب !دخول</div>
                </div>
                <p className="text-white/70 text-2xl font-bold">في شات اليوتيوب للانضمام</p>
              </motion.div>
            )}

            {/* العد التنازلي */}
            {gameState.isCountdown && (
              <motion.div
                className="text-center"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
              >
                <div className="relative">
                  <div className="absolute inset-0 bg-orange-500 rounded-full blur-3xl opacity-60 animate-pulse"></div>

                  <div className={`
                    relative w-56 h-56 rounded-full border-8 flex items-center justify-center shadow-2xl
                    ${gameState.countdown <= 3 
                      ? 'border-red-500 bg-red-500/30 animate-pulse' 
                      : 'border-orange-500 bg-orange-500/30'
                    }
                  `}>
                    <motion.span 
                      className={`
                        text-9xl font-black
                        ${gameState.countdown <= 3 ? 'text-red-300' : 'text-orange-300'}
                      `}
                      key={gameState.countdown}
                      initial={{ scale: 1.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      {gameState.countdown}
                    </motion.span>
                  </div>
                </div>
                <p className="text-white text-3xl font-bold mt-6">استعد للمبارزة...</p>
              </motion.div>
            )}

            {/* الرقم المستهدف */}
            {gameState.isPlaying && gameState.targetNumber && (
              <motion.div
                className="text-center"
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", duration: 0.6 }}
              >
                <div className="relative">
                  <div className="absolute inset-0 bg-cyan-500 rounded-full blur-3xl opacity-70 animate-ping"></div>

                  <div className="relative w-64 h-64 rounded-full border-8 border-cyan-400 bg-gradient-to-br from-cyan-500/40 to-blue-600/40 flex items-center justify-center shadow-[0_0_80px_rgba(34,211,238,0.9)]">
                    <span className="text-[10rem] font-black text-cyan-200 drop-shadow-2xl animate-pulse">
                      {gameState.targetNumber}
                    </span>
                  </div>
                </div>
                <motion.div
                  className="mt-8 px-10 py-4 bg-cyan-600/80 backdrop-blur-md rounded-full border-2 border-cyan-400"
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                >
                  <p className="text-white text-3xl font-black">⚡ اكتبه في الشات! ⚡</p>
                </motion.div>
              </motion.div>
            )}

            {/* الفائز */}
            {gameState.isFinished && gameState.winner && (
              <motion.div
                className="text-center"
                initial={{ scale: 0, y: 50 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ delay: 1.5, type: "spring" }}
              >
                <div className="relative mb-8">
                  <div className="absolute inset-0 bg-yellow-500 rounded-full blur-3xl opacity-70 animate-pulse"></div>
                  <Trophy size={140} className="relative text-yellow-400 fill-yellow-400 drop-shadow-2xl animate-bounce" />
                </div>

                <h2 className="text-6xl font-black text-yellow-400 mb-3 drop-shadow-lg">
                  🎉 {gameState.winner.username} 🎉
                </h2>
                <p className="text-3xl text-white font-bold mb-2">فاز بالمبارزة!</p>

                {gameState.responseTime && (
                  <div className="mt-4 px-6 py-2 bg-white/10 backdrop-blur-md rounded-full inline-block">
                    <p className="text-cyan-300 text-2xl font-bold">
                      ⚡ {(gameState.responseTime / 1000).toFixed(2)} ثانية
                    </p>
                  </div>
                )}

                {/* نجوم متحركة */}
                <div className="absolute inset-0 pointer-events-none">
                  {[...Array(20)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute w-4 h-4 bg-yellow-400 rounded-full"
                      initial={{ x: "50%", y: "50%", scale: 0 }}
                      animate={{ 
                        x: `${50 + (Math.random() - 0.5) * 100}%`,
                        y: `${50 + (Math.random() - 0.5) * 100}%`,
                        scale: [0, 1, 0],
                        opacity: [0, 1, 0]
                      }}
                      transition={{ 
                        duration: 2,
                        delay: i * 0.1,
                        repeat: Infinity
                      }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </div>

          {/* لاعب يمين */}
          <div className="flex justify-center">
            <PlayerCard 
              player={gameState.rightPlayer} 
              position="right"
              shotFired={shotFired === 'right'}
              isDead={gameState.rightPlayer ? !gameState.rightPlayer.isAlive : false}
            />
          </div>
        </div>

        {/* 📜 تعليمات سريعة */}
        {gameState.isWaiting && (
          <motion.div
            className="mt-12 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <div className="inline-block px-8 py-4 bg-black/60 backdrop-blur-xl rounded-2xl border border-white/20">
              <p className="text-white/80 text-xl font-medium">
                💬 اكتب <span className="text-cyan-400 font-black">!دخول</span> في شات اليوتيوب للانضمام للعبة
              </p>
            </div>
          </motion.div>
        )}
      </div>

      {/* CSS للـ animation */}
      <style jsx>{`
        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
      `}</style>
    </div>
  );
}