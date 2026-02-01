import { useState, useEffect, useRef } from "react";
import { Target, Trophy, Skull, Crown, Users } from "lucide-react";
import { io, Socket } from "socket.io-client";

// 🎮 تعريف أنواع البيانات لتتوافق مع السيرفر
interface Player {
  id: string;
  username: string;
  avatarUrl?: string;
  position: 'left' | 'right';
  isAlive: boolean;
}

interface WaitingPlayer {
  username: string;
  avatarUrl?: string;
}

interface GameState {
  status: 'waiting' | 'countdown' | 'playing' | 'finished';
  targetNumber: number | null;
  winner: Player | null;
  leftPlayer: Player | null;
  rightPlayer: Player | null;
  countdown: number;
  responseTime?: number;
}

// 🔊 روابط الأصوات
const SOUNDS = {
  gunshot: "https://assets.mixkit.co/active_storage/sfx/2914/2914-preview.mp3",
  victory: "https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3",
  countdown: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3",
  playerJoin: "https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3",
  death: "https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3",
  bg_music: "https://assets.mixkit.co/active_storage/sfx/125/125-preview.mp3" // موسيقى خفيفة للانتظار
};

// 🎨 مكون: بطاقة اللاعب في الساحة
const PlayerCard = ({ player, position, shotFired, isDead }: { player: Player | null, position: 'left' | 'right', shotFired: boolean, isDead: boolean }) => {
  if (!player) return <div className="w-40 h-40" />; // مساحة فارغة للحفاظ على التنسيق

  return (
    <div className={`flex flex-col items-center gap-4 transition-all duration-500 ${isDead ? 'opacity-50 grayscale scale-90' : 'opacity-100 scale-100'}`}>
      {/* الصورة والإطار */}
      <div className="relative group">
        <div className={`w-48 h-48 rounded-full border-4 overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.5)] transition-colors duration-300 ${isDead ? 'border-red-600' : 'border-cyan-400 group-hover:shadow-[0_0_50px_rgba(34,211,238,0.6)]'}`}>
          {player.avatarUrl ? (
            <img src={player.avatarUrl} alt={player.username} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-slate-800 flex items-center justify-center text-5xl font-bold text-white">
              {player.username[0].toUpperCase()}
            </div>
          )}
        </div>

        {/* أيقونات الحالة */}
        {isDead && <Skull className="absolute inset-0 m-auto text-red-600 w-24 h-24 animate-bounce drop-shadow-lg" />}
        {!isDead && <Crown className="absolute -top-10 left-1/2 -translate-x-1/2 text-yellow-400 w-16 h-16 animate-pulse drop-shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" />}
      </div>

      {/* الاسم */}
      <div className={`px-8 py-2 rounded-xl border-2 font-black text-2xl shadow-xl backdrop-blur-md ${isDead ? 'bg-red-900/80 border-red-600 text-red-200' : 'bg-cyan-950/80 border-cyan-400 text-cyan-100'}`}>
        {player.username}
      </div>

      {/* سلاح ومؤثرات */}
      <div className={`text-7xl transition-transform duration-100 ${position === 'left' ? 'scale-x-[-1]' : ''} ${shotFired ? 'scale-125' : 'scale-100'}`}>
        🔫
      </div>
      {shotFired && <div className={`absolute top-20 ${position === 'left' ? '-right-10' : '-left-10'} text-8xl animate-ping`}>💥</div>}
    </div>
  );
};

// 📋 مكون: شريط الانتظار (Lobby)
const WaitingLobby = ({ players }: { players: WaitingPlayer[] }) => (
  <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-5xl bg-black/60 backdrop-blur-xl rounded-3xl border border-white/10 p-4 flex items-center gap-6 overflow-hidden animate-[slideUp_0.5s_ease-out]">
    <div className="flex items-center gap-2 px-4 border-r border-white/20 min-w-fit">
      <Users className="text-cyan-400 w-8 h-8" />
      <div className="text-left">
        <h3 className="text-white font-bold text-lg leading-none">قائمة الانتظار</h3>
        <span className="text-cyan-400 text-sm font-bold">{players.length} لاعبين</span>
      </div>
    </div>

    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide w-full mask-linear-fade">
      {players.length === 0 ? (
        <span className="text-white/40 italic py-2">في انتظار انضمام اللاعبين (اكتب !دخول)...</span>
      ) : (
        players.map((p, i) => (
          <div key={i} className="flex flex-col items-center min-w-[80px] animate-[popIn_0.3s_ease-out]" style={{ animationDelay: `${i * 0.1}s` }}>
            <div className="w-14 h-14 rounded-full border-2 border-white/30 overflow-hidden mb-1">
              {p.avatarUrl ? (
                <img src={p.avatarUrl} alt={p.username} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-slate-700 flex items-center justify-center text-white text-lg font-bold">{p.username[0]}</div>
              )}
            </div>
            <span className="text-white/80 text-xs truncate max-w-[80px]">{p.username}</span>
          </div>
        ))
      )}
    </div>
  </div>
);

// 🚀 المكون الرئيسي
export default function YouTubeGunDuelOverlay() {
  const [gameState, setGameState] = useState<GameState>({
    status: 'waiting',
    targetNumber: null,
    winner: null,
    leftPlayer: null,
    rightPlayer: null,
    countdown: 10,
  });

  const [waitingPlayers, setWaitingPlayers] = useState<WaitingPlayer[]>([]);
  const [shotFired, setShotFired] = useState<'left' | 'right' | null>(null);

  // ✅ استخدام useRef للأصوات - تُنشأ مرة واحدة فقط
  const audioRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  // ✅ استخدام useRef لـ Socket - يمنع إعادة الإنشاء
  const socketRef = useRef<Socket | null>(null);

  // ✅ useRef لتتبع عدد اللاعبين السابق (للمقارنة)
  const previousPlayerCountRef = useRef<number>(0);

  // 🎵 إعداد الأصوات - مرة واحدة فقط
  useEffect(() => {
    console.log("🎵 تهيئة الأصوات...");
    Object.entries(SOUNDS).forEach(([key, url]) => {
      const audio = new Audio(url);
      audio.volume = 0.6;
      audioRef.current.set(key, audio);
    });

    // التنظيف عند إزالة المكون
    return () => {
      console.log("🗑️ تنظيف الأصوات...");
      audioRef.current.forEach(audio => {
        audio.pause();
        audio.src = '';
      });
      audioRef.current.clear();
    };
  }, []); // ✅ مصفوفة فارغة - مرة واحدة فقط

  const playSound = (key: keyof typeof SOUNDS) => {
    const audio = audioRef.current.get(key);
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(err => {
        console.warn(`⚠️ فشل تشغيل الصوت ${key}:`, err);
      });
    }
  };

  // 🔌 الاتصال بالسيرفر - مرة واحدة فقط
  useEffect(() => {
    console.log("🔌 بدء الاتصال بالسيرفر...");

    // إنشاء اتصال Socket جديد
    const socket = io({ 
      path: "/socket.io", 
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    // حفظ في ref للوصول من أي مكان
    socketRef.current = socket;

    // عند الاتصال الناجح
    socket.on("connect", () => {
      console.log("✅ تم الاتصال بالسيرفر - Socket ID:", socket.id);

      // ✅ طلب قائمة اللاعبين الموجودين فوراً عند الاتصال
      socket.emit("get_waiting_players");
    });

    // عند فقدان الاتصال
    socket.on("disconnect", (reason) => {
      console.warn("❌ انقطع الاتصال:", reason);
    });

    // عند إعادة الاتصال
    socket.on("reconnect", (attemptNumber) => {
      console.log("🔄 إعادة الاتصال ناجحة بعد", attemptNumber, "محاولات");
      // طلب البيانات مرة أخرى
      socket.emit("get_waiting_players");
    });

    // 1. ✅ تحديث قائمة الانتظار (Lobby) - بدون تبعيات خارجية
    socket.on("players_waiting", ({ players }: { players: WaitingPlayer[] }) => {
      console.log("📋 تحديث قائمة الانتظار:", players.length, "لاعبين");

      // مقارنة مع العدد السابق من ref
      const previousCount = previousPlayerCountRef.current;
      const newCount = players.length;

      // تشغيل صوت فقط عند زيادة عدد اللاعبين
      if (newCount > previousCount) {
        console.log("🎵 لاعب جديد انضم!");
        playSound("playerJoin");
      }

      // تحديث العدد في ref
      previousPlayerCountRef.current = newCount;

      // تحديث الحالة
      setWaitingPlayers(players);
    });

    // 2. بدء اللعبة (نقل اللاعبين من القائمة للساحة)
    socket.on("game_started", ({ leftPlayer, rightPlayer }) => {
      console.log("🎮 بدء اللعبة:", leftPlayer.username, "vs", rightPlayer.username);
      setGameState({
        status: 'countdown',
        targetNumber: null,
        winner: null,
        leftPlayer,
        rightPlayer,
        countdown: 10
      });
      playSound("countdown");
    });

    // 3. العد التنازلي
    socket.on("countdown_tick", ({ seconds }) => {
      console.log("⏱️ العد التنازلي:", seconds);
      setGameState(prev => ({ ...prev, countdown: seconds }));
      if (seconds <= 3 && seconds > 0) playSound("countdown");
    });

    // 4. ظهور الهدف
    socket.on("show_target", ({ number }) => {
      console.log("🎯 ظهور الهدف:", number);
      setGameState(prev => ({ ...prev, status: 'playing', targetNumber: number }));
    });

    // 5. إطلاق النار والنتيجة
    socket.on("shot_fired", ({ shooter, victim, responseTime }) => {
      console.log("💥 إطلاق نار:", shooter.username, "→", victim.username, `(${responseTime}ms)`);
      setShotFired(shooter.position);
      playSound("gunshot");

      setTimeout(() => {
        setGameState(prev => ({
          ...prev,
          status: 'finished',
          winner: shooter,
          responseTime,
          [victim.position === 'left' ? 'leftPlayer' : 'rightPlayer']: { ...victim, isAlive: false }
        }));
        playSound("death");
        setTimeout(() => playSound("victory"), 800);
      }, 400);
    });

    // 6. إعادة التعيين
    socket.on("game_reset", () => {
      console.log("🔄 إعادة تعيين اللعبة");
      setGameState({
        status: 'waiting',
        targetNumber: null,
        winner: null,
        leftPlayer: null,
        rightPlayer: null,
        countdown: 10
      });
      setShotFired(null);
    });

    // 7. معالجة الأخطاء
    socket.on("connect_error", (error) => {
      console.error("❌ خطأ في الاتصال:", error);
    });

    // ✅ دالة التنظيف - إغلاق الاتصال عند إزالة المكون
    return () => {
      console.log("🛑 إغلاق اتصال Socket...");

      // إزالة جميع المستمعين
      socket.off("connect");
      socket.off("disconnect");
      socket.off("reconnect");
      socket.off("players_waiting");
      socket.off("game_started");
      socket.off("countdown_tick");
      socket.off("show_target");
      socket.off("shot_fired");
      socket.off("game_reset");
      socket.off("connect_error");

      // قطع الاتصال
      socket.disconnect();
      socketRef.current = null;
    };
  }, []); // ✅ مصفوفة فارغة - الاتصال مرة واحدة فقط!

  return (
    <div className="w-full h-screen bg-transparent relative overflow-hidden font-sans select-none">

      {/* الخلفية المعتمة */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />

      {/* 🏟️ ساحة المعركة */}
      <div className="relative z-10 h-full flex flex-col justify-center items-center pb-32">

        {/* العنوان */}
        <div className="absolute top-10 flex items-center gap-4 animate-[fadeInDown_1s]">
          <Target className="text-red-500 w-12 h-12" />
          <h1 className="text-6xl font-black text-white drop-shadow-[0_5px_5px_rgba(0,0,0,0.8)] tracking-tighter">
            مبارزة <span className="text-cyan-400">السرعة</span>
          </h1>
          <Target className="text-red-500 w-12 h-12" />
        </div>

        {/* منطقة اللاعبين والهدف */}
        <div className="w-full max-w-7xl flex items-center justify-between px-20">

          {/* اليسار */}
          <div className="w-1/3 flex justify-center">
            {gameState.leftPlayer && (
              <PlayerCard 
                player={gameState.leftPlayer} 
                position="left" 
                shotFired={shotFired === 'left'} 
                isDead={gameState.leftPlayer ? !gameState.leftPlayer.isAlive : false} 
              />
            )}
          </div>

          {/* المنتصف (الحالة) */}
          <div className="w-1/3 flex flex-col items-center justify-center min-h-[300px]">

            {/* حالة الانتظار */}
            {gameState.status === 'waiting' && (
              <div className="text-center animate-pulse">
                <div className="text-8xl mb-4">⏳</div>
                <h2 className="text-3xl font-bold text-white/80">في انتظار المتنافسين...</h2>
              </div>
            )}

            {/* العد التنازلي */}
            {gameState.status === 'countdown' && (
              <div className="relative">
                <div className="text-[10rem] font-black text-white drop-shadow-2xl animate-[ping_1s_infinite] opacity-50 absolute inset-0 text-center scale-150">
                  {gameState.countdown}
                </div>
                <div className={`text-[10rem] font-black drop-shadow-2xl z-10 relative ${gameState.countdown <= 3 ? 'text-red-500' : 'text-yellow-400'}`}>
                  {gameState.countdown}
                </div>
              </div>
            )}

            {/* الرقم المستهدف */}
            {gameState.status === 'playing' && gameState.targetNumber && (
              <div className="relative group animate-[popIn_0.2s_ease-out]">
                <div className="absolute inset-0 bg-cyan-400 blur-[60px] opacity-40 rounded-full group-hover:opacity-60 transition-opacity"></div>
                <div className="w-64 h-64 bg-black/50 backdrop-blur-md rounded-full border-[6px] border-cyan-400 flex items-center justify-center shadow-[0_0_50px_rgba(34,211,238,0.5)]">
                  <span className="text-9xl font-black text-white tracking-widest">{gameState.targetNumber}</span>
                </div>
                <div className="absolute -bottom-16 w-full text-center">
                  <span className="bg-red-600 text-white px-6 py-2 rounded-full text-xl font-bold animate-pulse shadow-lg">اكتب الرقم بسرعة!</span>
                </div>
              </div>
            )}

            {/* النتيجة */}
            {gameState.status === 'finished' && gameState.winner && (
              <div className="text-center animate-[zoomIn_0.5s]">
                <Trophy className="w-32 h-32 text-yellow-400 mx-auto drop-shadow-[0_0_30px_rgba(250,204,21,0.6)] animate-bounce" />
                <h2 className="text-5xl font-black text-white mt-4 drop-shadow-lg">{gameState.winner.username}</h2>
                <p className="text-2xl text-yellow-400 font-bold mt-2">فاز في {gameState.responseTime}ms ⚡</p>
              </div>
            )}
          </div>

          {/* اليمين */}
          <div className="w-1/3 flex justify-center">
            {gameState.rightPlayer && (
              <PlayerCard 
                player={gameState.rightPlayer} 
                position="right" 
                shotFired={shotFired === 'right'} 
                isDead={gameState.rightPlayer ? !gameState.rightPlayer.isAlive : false} 
              />
            )}
          </div>
        </div>
      </div>

      {/* 📋 شريط الانتظار السفلي (Lobby) */}
      <WaitingLobby players={waitingPlayers} />

      {/* CSS Animations */}
      <style>{`
        @keyframes popIn { 0% { transform: scale(0); } 80% { transform: scale(1.1); } 100% { transform: scale(1); } }
        @keyframes slideUp { from { transform: translate(-50%, 100%); } to { transform: translate(-50%, 0); } }
        @keyframes zoomIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes fadeInDown { from { transform: translateY(-50px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .mask-linear-fade { mask-image: linear-gradient(to right, black 85%, transparent 100%); }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
