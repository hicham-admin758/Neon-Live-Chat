import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Target, Trophy, Users, Zap, Skull, Crown } from "lucide-react";
import { io, Socket } from "socket.io-client";
import { useToast } from "@/hooks/use-toast";

// 🎮 أنواع البيانات
interface Player {
  id: number;
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
}

// 🔊 أصوات اللعبة
const SOUNDS = {
  gunshot: "https://assets.mixkit.co/active_storage/sfx/2914/2914-preview.mp3",
  victory: "https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3",
  countdown: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3",
  playerJoin: "https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3",
  death: "https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3"
};

export default function GunDuelGame() {
  const { toast } = useToast();
  const [gameState, setGameState] = useState<GameState>({
    isWaiting: true,
    isCountdown: false,
    isPlaying: false,
    isFinished: false,
    targetNumber: null,
    winner: null,
    leftPlayer: null,
    rightPlayer: null,
    countdown: 10
  });

  const [waitingPlayers, setWaitingPlayers] = useState<number>(0);
  const [shotFired, setShotFired] = useState<'left' | 'right' | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const audioCache = useRef<Map<string, HTMLAudioElement>>(new Map());

  // 🔊 تحميل الأصوات مسبقاً
  useEffect(() => {
    Object.entries(SOUNDS).forEach(([key, url]) => {
      const audio = new Audio(url);
      audio.preload = "auto";
      audio.volume = 0.6;
      audioCache.current.set(key, audio);
    });
  }, []);

  // 🎵 تشغيل الصوت
  const playSound = (soundKey: keyof typeof SOUNDS) => {
    try {
      const audio = audioCache.current.get(soundKey);
      if (audio) {
        const clone = audio.cloneNode() as HTMLAudioElement;
        clone.volume = 0.6;
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
      reconnectionAttempts: 5
    });

    socketRef.current = socket;

    // 👥 عندما ينضم لاعبون للانتظار
    socket.on("players_waiting", ({ count }: { count: number }) => {
      setWaitingPlayers(count);

      if (count >= 2) {
        toast({
          title: "✅ جاهز للبدء!",
          description: `${count} لاعبين في الانتظار`,
          duration: 2000
        });
      }
    });

    // 🎮 بداية اللعبة - اختيار لاعبين
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

      toast({
        title: "🎮 اللعبة بدأت!",
        description: `${leftPlayer.username} ضد ${rightPlayer.username}`,
        duration: 3000
      });
    });

    // ⏱️ العد التنازلي
    socket.on("countdown_tick", ({ seconds }: { seconds: number }) => {
      setGameState(prev => ({ ...prev, countdown: seconds }));

      if (seconds <= 3) {
        playSound("countdown");
      }
    });

    // 🎯 ظهور الرقم المستهدف
    socket.on("show_target", ({ number }: { number: number }) => {
      setGameState(prev => ({
        ...prev,
        isCountdown: false,
        isPlaying: true,
        targetNumber: number
      }));

      toast({
        title: "🎯 اكتب الرقم بسرعة!",
        description: `الرقم هو: ${number}`,
        duration: 1500
      });
    });

    // 💥 لاعب أطلق النار
    socket.on("shot_fired", ({ 
      shooter, 
      victim 
    }: { 
      shooter: Player; 
      victim: Player; 
    }) => {
      playSound("gunshot");
      setShotFired(shooter.position);

      // تأخير بسيط ثم عرض الموت
      setTimeout(() => {
        playSound("death");

        setGameState(prev => ({
          ...prev,
          isPlaying: false,
          isFinished: true,
          winner: shooter,
          [victim.position === 'left' ? 'leftPlayer' : 'rightPlayer']: {
            ...victim,
            isAlive: false
          }
        }));

        toast({
          title: "💥 تم إطلاق النار!",
          description: `${shooter.username} فاز باللعبة!`,
          duration: 3000
        });
      }, 500);

      // صوت الفوز
      setTimeout(() => {
        playSound("victory");
      }, 1000);
    });

    // 🔄 إعادة تعيين اللعبة
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
        countdown: 10
      });
      setShotFired(null);
      setWaitingPlayers(0);

      toast({
        title: "🔄 تمت إعادة تعيين اللعبة",
        duration: 2000
      });
    });

    // معالجة الأخطاء
    socket.on("error", ({ message }: { message: string }) => {
      toast({
        title: "⚠️ خطأ",
        description: message,
        variant: "destructive",
        duration: 3000
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [toast]);

  // 🎯 المكون: لاعب مع مسدس
  const PlayerCard = ({ player, position }: { player: Player | null; position: 'left' | 'right' }) => {
    if (!player) {
      return (
        <div className="flex flex-col items-center gap-4">
          <div className="w-32 h-32 rounded-full border-4 border-dashed border-white/20 flex items-center justify-center">
            <Users size={50} className="text-white/30" />
          </div>
          <p className="text-white/40 font-bold">في الانتظار...</p>
        </div>
      );
    }

    const isShooting = shotFired === position;
    const isDead = !player.isAlive;

    return (
      <motion.div 
        className="flex flex-col items-center gap-4 relative"
        initial={{ opacity: 0, x: position === 'left' ? -100 : 100 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* 👤 صورة اللاعب */}
        <div className={`
          relative w-32 h-32 rounded-full border-4 transition-all duration-300
          ${isDead 
            ? 'border-red-600 grayscale opacity-50' 
            : 'border-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.5)]'
          }
        `}>
          {/* تأثير الانفجار عند الموت */}
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
              <img src={player.avatarUrl} alt={player.username} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-4xl font-black text-white">
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
              <Skull size={60} className="text-red-600 drop-shadow-2xl" />
            </motion.div>
          )}

          {/* تاج الفائز */}
          {gameState.winner?.id === player.id && (
            <motion.div
              className="absolute -top-10 left-1/2 -translate-x-1/2"
              initial={{ y: -20, opacity: 0, rotate: -20 }}
              animate={{ y: 0, opacity: 1, rotate: 0 }}
              transition={{ delay: 1, duration: 0.5 }}
            >
              <Crown size={50} className="text-yellow-400 fill-yellow-400 drop-shadow-lg animate-bounce" />
            </motion.div>
          )}
        </div>

        {/* 🏷️ اسم اللاعب */}
        <div className={`
          px-6 py-2 rounded-full border-2 font-black text-lg backdrop-blur-md
          ${isDead 
            ? 'bg-red-900/50 border-red-600 text-red-200' 
            : 'bg-cyan-900/50 border-cyan-400 text-cyan-200'
          }
        `}>
          {player.username}
        </div>

        {/* 🔫 المسدس */}
        <motion.div
          className={`text-6xl ${position === 'left' ? 'scale-x-[-1]' : ''}`}
          animate={isShooting ? { 
            x: position === 'left' ? 30 : -30,
            rotate: position === 'left' ? -20 : 20,
            scale: 1.3
          } : {}}
          transition={{ duration: 0.2 }}
        >
          🔫
        </motion.div>

        {/* 💥 تأثير إطلاق النار */}
        <AnimatePresence>
          {isShooting && (
            <motion.div
              className={`absolute top-1/2 ${position === 'left' ? 'right-0' : 'left-0'}`}
              initial={{ scale: 0, x: position === 'left' ? 20 : -20 }}
              animate={{ scale: [1, 2, 0], x: position === 'left' ? 100 : -100 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="text-6xl">💥</div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-red-900 flex items-center justify-center p-4 relative overflow-hidden">

      {/* 🎨 خلفية متحركة */}
      <div className="absolute inset-0 overflow-hidden opacity-20">
        <div className="absolute w-96 h-96 bg-red-500 rounded-full blur-[150px] -top-48 -left-48 animate-pulse"></div>
        <div className="absolute w-96 h-96 bg-cyan-500 rounded-full blur-[150px] -bottom-48 -right-48 animate-pulse delay-75"></div>
      </div>

      <div className="relative z-10 w-full max-w-6xl">

        {/* 🎯 عنوان اللعبة */}
        <motion.div 
          className="text-center mb-12"
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <Target className="text-red-500" size={50} />
            <h1 className="text-6xl font-black text-white drop-shadow-lg">مبارزة المسدسات</h1>
            <Target className="text-red-500" size={50} />
          </div>
          <p className="text-white/60 text-xl font-bold">من سيكون الأسرع؟ 🎯</p>
        </motion.div>

        {/* 🎮 منطقة اللعب */}
        <div className="bg-black/60 backdrop-blur-xl rounded-3xl border-2 border-white/10 p-8 shadow-2xl">

          {/* 👥 اللاعبان */}
          <div className="grid grid-cols-3 gap-8 items-center mb-8">

            {/* لاعب يسار */}
            <div className="flex justify-center">
              <PlayerCard player={gameState.leftPlayer} position="left" />
            </div>

            {/* 🎯 المنطقة الوسطى */}
            <div className="flex flex-col items-center justify-center gap-6">

              {/* حالة الانتظار */}
              {gameState.isWaiting && (
                <motion.div 
                  className="text-center"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                >
                  <div className="w-40 h-40 rounded-full border-4 border-dashed border-white/20 flex items-center justify-center mb-4 animate-spin-slow">
                    <Users size={60} className="text-white/40" />
                  </div>
                  <p className="text-white text-2xl font-black mb-2">في الانتظار</p>
                  <p className="text-cyan-400 text-4xl font-black">{waitingPlayers}</p>
                  <p className="text-white/60 text-sm font-bold mt-1">لاعبين جاهزين</p>
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
                    {/* تأثير التوهج */}
                    <div className="absolute inset-0 bg-orange-500 rounded-full blur-3xl opacity-50 animate-pulse"></div>

                    <div className={`
                      relative w-48 h-48 rounded-full border-8 flex items-center justify-center
                      ${gameState.countdown <= 3 
                        ? 'border-red-500 bg-red-500/20 animate-pulse' 
                        : 'border-orange-500 bg-orange-500/20'
                      }
                    `}>
                      <motion.span 
                        className={`
                          text-8xl font-black
                          ${gameState.countdown <= 3 ? 'text-red-400' : 'text-orange-400'}
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
                  <p className="text-white text-xl font-bold mt-4">استعد للمبارزة...</p>
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
                    {/* موجات متحركة */}
                    <div className="absolute inset-0 bg-cyan-500 rounded-full blur-2xl opacity-60 animate-ping"></div>

                    <div className="relative w-56 h-56 rounded-full border-8 border-cyan-400 bg-gradient-to-br from-cyan-500/30 to-blue-600/30 flex items-center justify-center shadow-[0_0_60px_rgba(34,211,238,0.8)]">
                      <span className="text-9xl font-black text-cyan-300 drop-shadow-2xl animate-pulse">
                        {gameState.targetNumber}
                      </span>
                    </div>
                  </div>
                  <motion.div
                    className="mt-6 px-8 py-3 bg-cyan-600 rounded-full"
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ repeat: Infinity, duration: 1 }}
                  >
                    <p className="text-white text-2xl font-black">⚡ اكتب الرقم بسرعة! ⚡</p>
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
                  <div className="relative mb-6">
                    <div className="absolute inset-0 bg-yellow-500 rounded-full blur-3xl opacity-60 animate-pulse"></div>
                    <Trophy size={120} className="relative text-yellow-400 fill-yellow-400 drop-shadow-2xl animate-bounce" />
                  </div>

                  <h2 className="text-5xl font-black text-yellow-400 mb-2 drop-shadow-lg">
                    🎉 {gameState.winner.username} 🎉
                  </h2>
                  <p className="text-2xl text-white font-bold">فاز بالمبارزة!</p>

                  {/* نجوم متحركة */}
                  <div className="absolute inset-0 pointer-events-none">
                    {[...Array(15)].map((_, i) => (
                      <motion.div
                        key={i}
                        className="absolute w-3 h-3 bg-yellow-400 rounded-full"
                        initial={{ 
                          x: "50%", 
                          y: "50%",
                          scale: 0 
                        }}
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
              <PlayerCard player={gameState.rightPlayer} position="right" />
            </div>
          </div>

          {/* 🎮 أزرار التحكم */}
          <div className="flex gap-4 justify-center mt-8">
            {gameState.isWaiting && (
              <Button
                onClick={() => socketRef.current?.emit("join_queue")}
                className="px-8 py-6 text-xl font-black bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 rounded-2xl shadow-lg transition-all hover:scale-105"
              >
                <Zap className="mr-2" size={24} />
                الانضمام للعبة
              </Button>
            )}

            {(gameState.isFinished || gameState.isPlaying) && (
              <Button
                onClick={() => socketRef.current?.emit("reset_game")}
                className="px-8 py-6 text-xl font-black bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 rounded-2xl shadow-lg transition-all hover:scale-105"
              >
                🔄 إعادة اللعبة
              </Button>
            )}
          </div>

          {/* 📜 التعليمات */}
          <div className="mt-8 p-6 bg-white/5 rounded-2xl border border-white/10">
            <h3 className="text-white font-black text-xl mb-3 flex items-center gap-2">
              <Target size={24} className="text-cyan-400" />
              كيف تلعب:
            </h3>
            <ol className="text-white/80 space-y-2 text-sm font-medium list-decimal list-inside">
              <li>اكتب "دخول" في الشات للانضمام للعبة</li>
              <li>يتم اختيار لاعبين عشوائياً من قائمة الانتظار</li>
              <li>انتظر العد التنازلي 10 ثوانٍ</li>
              <li>عند ظهور الرقم، اكتبه بأسرع ما يمكن في الشات</li>
              <li>أول من يكتب الرقم الصحيح يطلق النار ويفوز! 🎯</li>
            </ol>
          </div>
        </div>

        {/* 📊 إحصائيات */}
        <motion.div 
          className="mt-6 text-center text-white/60 text-sm font-medium"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <p>🎮 لعبة مبارزة المسدسات • تم التطوير بواسطة Claude AI</p>
        </motion.div>
      </div>
    </div>
  );
}