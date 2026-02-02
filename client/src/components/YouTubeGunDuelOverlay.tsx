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
  status: 'waiting' | 'countdown' | 'ready' | 'playing' | 'finished';
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
      {/* الصورة والإطار مع تأثيرات نيون */}
      <div className="relative group">
        {/* حلقة الإضاءة الخارجية */}
        <div className={`absolute inset-0 rounded-full blur-xl transition-all duration-300 ${isDead ? 'bg-red-500/30 scale-110' : 'bg-cyan-400/40 scale-100 group-hover:scale-110'}`}></div>

        <div className={`relative w-48 h-48 rounded-full border-4 overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.5)] transition-all duration-300 ${isDead ? 'border-red-500 shadow-[0_0_40px_rgba(239,68,68,0.6)]' : 'border-cyan-400 shadow-[0_0_50px_rgba(34,211,238,0.6)] group-hover:shadow-[0_0_70px_rgba(34,211,238,0.8)]'}`}>
          {player.avatarUrl ? (
            <img src={player.avatarUrl} alt={player.username} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-5xl font-bold text-white relative">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-purple-500/20 rounded-full"></div>
              <span className="relative z-10">{player.username && player.username.length > 0 ? player.username[0].toUpperCase() : '?'}</span>
            </div>
          )}

          {/* تأثير الإضاءة الداخلية */}
          {!isDead && (
            <div className="absolute inset-0 rounded-full bg-gradient-to-t from-transparent via-cyan-400/10 to-cyan-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          )}
        </div>

        {/* أيقونات الحالة مع تحسينات */}
        {isDead && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Skull className="text-red-500 w-24 h-24 animate-bounce drop-shadow-[0_0_20px_rgba(239,68,68,0.8)]" />
          </div>
        )}
        {!isDead && (
          <Crown className="absolute -top-12 left-1/2 -translate-x-1/2 text-yellow-400 w-16 h-16 animate-pulse drop-shadow-[0_0_20px_rgba(250,204,21,0.8)] opacity-0 group-hover:opacity-100 transition-all duration-500" />
        )}

        {/* تأثير الإطلاق */}
        {shotFired && (
          <div className="absolute inset-0 rounded-full border-4 border-yellow-400 animate-ping"></div>
        )}
      </div>

      {/* الاسم مع تحسينات */}
      <div className={`relative px-8 py-3 rounded-xl border-2 font-black text-2xl shadow-xl backdrop-blur-md transition-all duration-300 ${isDead ? 'bg-red-900/90 border-red-500 text-red-100 shadow-[0_0_20px_rgba(239,68,68,0.5)]' : 'bg-cyan-950/90 border-cyan-400 text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.5)] hover:shadow-[0_0_30px_rgba(34,211,238,0.7)]'}`}>
        <div className={`absolute inset-0 rounded-xl blur-sm ${isDead ? 'bg-red-500/20' : 'bg-cyan-400/20'}`}></div>
        <span className="relative z-10">{player.username || 'لاعب غير معروف'}</span>
      </div>

      {/* سلاح ومؤثرات محسنة */}
      <div className={`relative text-7xl transition-all duration-300 ${position === 'left' ? 'scale-x-[-1]' : ''} ${shotFired ? 'scale-125 animate-bounce' : 'scale-100'}`}>
        🔫
        {/* تأثير الإضاءة على السلاح */}
        <div className={`absolute inset-0 text-7xl blur-sm ${isDead ? 'text-red-500/50' : 'text-cyan-400/50'} transition-all duration-300`}>🔫</div>
      </div>

      {/* تأثير الإطلاق المحسن */}
      {shotFired && (
        <div className={`absolute top-20 ${position === 'left' ? '-right-16' : '-left-16'} text-8xl animate-ping drop-shadow-[0_0_20px_rgba(250,204,21,0.8)]`}>
          💥
        </div>
      )}

      {/* خطوط الإضاءة الجانبية */}
      {!isDead && (
        <>
          <div className="absolute top-0 bottom-0 left-0 w-1 bg-gradient-to-b from-transparent via-cyan-400/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          <div className="absolute top-0 bottom-0 right-0 w-1 bg-gradient-to-b from-transparent via-cyan-400/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        </>
      )}
    </div>
  );
};

// 📋 مكون: شريط الانتظار (Lobby)
const WaitingLobby = ({ players, onStartGame }: { players: WaitingPlayer[], onStartGame: () => void }) => (
  <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[95%] max-w-6xl bg-black/70 backdrop-blur-2xl rounded-3xl border border-white/20 p-6 flex items-center gap-6 overflow-hidden animate-[slideUp_0.5s_ease-out] shadow-[0_0_40px_rgba(0,0,0,0.5)]">
    <div className="flex items-center gap-4 px-6 border-r border-white/30 min-w-fit relative">
      <div className="relative">
        <Users className="text-cyan-400 w-10 h-10 drop-shadow-[0_0_10px_rgba(34,211,238,0.6)]" />
        <div className="absolute inset-0 text-cyan-400 w-10 h-10 blur-sm"></div>
      </div>
      <div className="text-left">
        <h3 className="text-white font-bold text-xl leading-none drop-shadow-lg">قائمة الانتظار</h3>
        <span className="text-cyan-400 text-lg font-bold drop-shadow-[0_0_5px_rgba(34,211,238,0.6)]">{players.length} لاعبين</span>
      </div>
    </div>

    {/* زر بدء اللعبة */}
    {players.length >= 2 && (
      <div className="flex items-center gap-4 px-6 border-r border-white/30 min-w-fit">
        <button
          onClick={onStartGame}
          className="bg-gradient-to-r from-red-600 to-red-800 hover:from-red-700 hover:to-red-900 text-white font-bold py-3 px-6 rounded-xl border border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:shadow-[0_0_30px_rgba(239,68,68,0.6)] transition-all duration-300 transform hover:scale-105"
        >
          🔫 بدء المبارزة
        </button>
      </div>
    )}

    {/* زر إضافة لاعبين تجريبيين */}
    <div className="flex items-center gap-4 px-6 border-r border-white/30 min-w-fit">
      <button
        onClick={async () => {
          try {
            // إضافة لاعبين تجريبيين عبر API
            await fetch("/api/game/add-test-players", { method: "POST" });
            // إعادة تحميل الصفحة لتحديث القائمة
            setTimeout(() => window.location.reload(), 500);
          } catch (e) {
            console.error("Failed to add test players", e);
          }
        }}
        className="bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-700 hover:to-purple-900 text-white font-bold py-2 px-4 rounded-lg border border-purple-500/50 shadow-[0_0_15px_rgba(147,51,234,0.4)] hover:shadow-[0_0_20px_rgba(147,51,234,0.6)] transition-all duration-300 transform hover:scale-105 text-sm"
      >
        🧪 إضافة لاعبين تجريبيين
      </button>
    </div>

    {/* زر تصفير القائمة */}
    {players.length > 0 && (
      <div className="flex items-center gap-4 px-6 border-r border-white/30 min-w-fit">
        <button
          onClick={async () => {
            try {
              await fetch("/api/game/clear-participants", { method: "POST" });
              // إعادة تحميل الصفحة لتحديث القائمة
              window.location.reload();
            } catch (e) {
              console.error("Failed to reset lobby", e);
            }
          }}
          className="bg-gradient-to-r from-gray-600 to-gray-800 hover:from-gray-700 hover:to-gray-900 text-white font-bold py-2 px-4 rounded-lg border border-gray-500/50 shadow-[0_0_15px_rgba(107,114,128,0.4)] hover:shadow-[0_0_20px_rgba(107,114,128,0.6)] transition-all duration-300 transform hover:scale-105 text-sm"
        >
          🗑️ تصفير القائمة
        </button>
      </div>
    )}

    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide w-full mask-linear-fade">
      {players.length === 0 ? (
        <div className="flex items-center gap-4 py-2 px-4 bg-white/5 rounded-xl border border-white/10">
          <div className="text-2xl animate-pulse">⏳</div>
          <span className="text-white/60 italic text-lg">في انتظار انضمام اللاعبين (اكتب !دخول في شات يوتيوب)</span>
        </div>
      ) : players.length === 1 ? (
        <div className="flex items-center gap-4 py-2 px-4 bg-yellow-500/10 rounded-xl border border-yellow-500/20">
          <div className="text-2xl">👤</div>
          <span className="text-yellow-400 text-lg">انتظر لاعب آخر للبدء (اكتب !دخول في شات يوتيوب)</span>
        </div>
      ) : (
        players.map((p, i) => (
          <div key={i} className="flex flex-col items-center min-w-[90px] animate-[popIn_0.3s_ease-out] group" style={{ animationDelay: `${i * 0.1}s` }}>
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-3 border-white/40 overflow-hidden mb-2 shadow-[0_0_15px_rgba(255,255,255,0.2)] group-hover:shadow-[0_0_25px_rgba(34,211,238,0.4)] group-hover:border-cyan-400/60 transition-all duration-300">
                {p.avatarUrl ? (
                  <img src={p.avatarUrl} alt={p.username} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-white text-xl font-bold group-hover:from-cyan-600 group-hover:to-purple-600 transition-all duration-300">
                    {p.username[0]}
                  </div>
                )}
              </div>
              {/* تأثير الإضاءة */}
              <div className="absolute inset-0 w-16 h-16 rounded-full bg-cyan-400/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10"></div>
            </div>
            <span className="text-white/90 text-sm truncate max-w-[90px] font-medium drop-shadow-sm group-hover:text-cyan-300 transition-colors duration-300">{p.username}</span>
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
    countdown: 5,
  });

  const [waitingPlayers, setWaitingPlayers] = useState<WaitingPlayer[]>([]);
  const [shotFired, setShotFired] = useState<'left' | 'right' | null>(null);
  const audioRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const socketRef = useRef<Socket | null>(null);

  // 🎵 إعداد الأصوات
  useEffect(() => {
    Object.entries(SOUNDS).forEach(([key, url]) => {
      const audio = new Audio(url);
      audio.volume = 0.6;
      audioRef.current.set(key, audio);
    });
  }, []);

  const playSound = (key: keyof typeof SOUNDS) => {
    const audio = audioRef.current.get(key);
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
  };

  // � دالة بدء اللعبة يدوياً
  const handleStartGame = () => {
    if (socketRef.current) {
      socketRef.current.emit('start_gun_duel');
    }
  };

  // �🔌 الاتصال بالسيرفر
  useEffect(() => {
    const socket = io({ path: "/socket.io", transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    // 1. تحديث قائمة الانتظار (Lobby)
    socket.on("players_waiting", ({ players }: { players: WaitingPlayer[] }) => {
      setWaitingPlayers(players);
      if (players.length > waitingPlayers.length) playSound("playerJoin");
    });

    // 2. بدء اللعبة (نقل اللاعبين من القائمة للساحة)
    socket.on("game_started", ({ leftPlayer, rightPlayer }) => {
      setGameState({
        status: 'countdown',
        targetNumber: null,
        winner: null,
        leftPlayer,
        rightPlayer,
        countdown: 5
      });
      playSound("countdown");
    });

    // 3. العد التنازلي
    socket.on("countdown_tick", ({ seconds }) => {
      setGameState(prev => ({ ...prev, countdown: seconds }));
      if (seconds <= 3 && seconds > 0) playSound("countdown");
    });

    // 4. مرحلة الاستعداد
    socket.on("game_ready", () => {
      setGameState(prev => ({ ...prev, status: 'ready' }));
      playSound("victory"); // أو صوت مناسب للاستعداد
    });

    // 5. ظهور الهدف
    socket.on("show_target", ({ number }) => {
      setGameState(prev => ({ ...prev, status: 'playing', targetNumber: number }));
    });

    // 5. إطلاق النار والنتيجة
    socket.on("shot_fired", ({ shooter, victim, responseTime }) => {
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
      setGameState(prev => ({
        ...prev,
        status: 'waiting',
        targetNumber: null,
        winner: null,
        leftPlayer: null,
        rightPlayer: null
      }));
      setShotFired(null);
    });

    return () => { socket.disconnect(); };
  }, [waitingPlayers.length]);

  return (
    <div className="w-full h-screen bg-transparent relative overflow-hidden font-sans select-none">

      {/* الخلفية المتحركة مع تأثيرات نيون */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black">
        {/* تأثيرات النجوم المتحركة */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-white rounded-full animate-pulse"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${2 + Math.random() * 3}s`
              }}
            />
          ))}
        </div>

        {/* تأثيرات الإضاءة النيون */}
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-10 left-10 w-32 h-32 bg-cyan-500/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-20 right-20 w-40 h-40 bg-red-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-60 h-60 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
        </div>
      </div>

      {/* طبقة الخلفية المعتمة */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />

      {/* 🏟️ ساحة المعركة */}
      <div className="relative z-10 h-full flex flex-col justify-center items-center pb-32">

        {/* العنوان مع تحسينات */}
        <div className="absolute top-10 flex items-center gap-6 animate-[fadeInDown_1s] z-20">
          <div className="relative">
            <Target className="text-red-500 w-16 h-16 drop-shadow-[0_0_20px_rgba(239,68,68,0.8)] animate-pulse" />
            <div className="absolute inset-0 text-red-500 w-16 h-16 blur-sm animate-pulse"></div>
          </div>
          <h1 className="text-7xl font-black text-white drop-shadow-[0_5px_5px_rgba(0,0,0,0.8)] tracking-tighter relative">
            <span className="bg-gradient-to-r from-cyan-400 via-purple-500 to-red-500 bg-clip-text text-transparent animate-pulse">
              مبارزة
            </span>
            <span className="text-white ml-4">السرعة</span>
            {/* تأثير الإضاءة على النص */}
            <div className="absolute inset-0 text-7xl font-black text-cyan-400/20 blur-sm -z-10">مبارزة السرعة</div>
          </h1>
          <div className="relative">
            <Target className="text-red-500 w-16 h-16 drop-shadow-[0_0_20px_rgba(239,68,68,0.8)] animate-pulse" />
            <div className="absolute inset-0 text-red-500 w-16 h-16 blur-sm animate-pulse"></div>
          </div>
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

            {/* مرحلة الاستعداد */}
            {gameState.status === 'ready' && (
              <div className="relative animate-pulse">
                <div className="text-[8rem] font-black text-green-400 drop-shadow-2xl animate-[ping_1s_infinite]">
                  استعداد
                </div>
                <div className="absolute inset-0 text-[8rem] font-black text-green-400/50 blur-sm animate-[ping_1s_infinite] scale-110">
                  استعداد
                </div>
              </div>
            )}

            {/* الرقم المستهدف مع تحسينات */}
            {gameState.status === 'playing' && gameState.targetNumber && (
              <div className="relative group animate-[popIn_0.2s_ease-out]">
                {/* حلقات الإضاءة الخارجية */}
                <div className="absolute inset-0 bg-cyan-400 blur-[80px] opacity-30 rounded-full animate-pulse"></div>
                <div className="absolute inset-0 bg-purple-500 blur-[60px] opacity-20 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }}></div>

                <div className="relative w-80 h-80 bg-black/60 backdrop-blur-xl rounded-full border-[8px] border-cyan-400 flex items-center justify-center shadow-[0_0_60px_rgba(34,211,238,0.6)] group-hover:shadow-[0_0_80px_rgba(34,211,238,0.8)] transition-all duration-300">
                  {/* تأثير الإضاءة الداخلية */}
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-400/20 via-purple-500/20 to-red-500/20 animate-pulse"></div>

                  <span className="text-9xl font-black text-white tracking-widest relative z-10 drop-shadow-[0_0_20px_rgba(255,255,255,0.8)] animate-pulse">
                    {gameState.targetNumber}
                  </span>
                </div>

                <div className="absolute -bottom-20 w-full text-center">
                  <span className="bg-gradient-to-r from-red-600 to-red-800 text-white px-8 py-3 rounded-full text-xl font-bold animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.6)] border border-red-500/50">
                    اكتب الرقم بسرعة! ⚡
                  </span>
                </div>
              </div>
            )}

            {/* النتيجة مع تحسينات */}
            {gameState.status === 'finished' && gameState.winner && (
              <div className="text-center animate-[zoomIn_0.5s] relative">
                {/* تأثيرات الخلفية للنتيجة */}
                <div className="absolute inset-0 bg-gradient-to-r from-yellow-400/20 via-orange-500/20 to-red-500/20 blur-3xl rounded-full animate-pulse"></div>

                <div className="relative z-10">
                  <Trophy className="w-32 h-32 text-yellow-400 mx-auto drop-shadow-[0_0_30px_rgba(250,204,21,0.8)] animate-bounce" />
                  <h2 className="text-6xl font-black text-white mt-4 drop-shadow-[0_0_20px_rgba(255,255,255,0.8)]">
                    <span className="bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
                      {gameState.winner.username}
                    </span>
                  </h2>
                  <p className="text-3xl text-yellow-400 font-bold mt-2 drop-shadow-[0_0_10px_rgba(250,204,21,0.6)] animate-pulse">
                    فاز في {gameState.responseTime}ms ⚡
                  </p>
                </div>
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
      <WaitingLobby players={waitingPlayers} onStartGame={handleStartGame} />

      {/* CSS Animations المحسنة */}
      <style>{`
        @keyframes popIn { 0% { transform: scale(0); opacity: 0; } 80% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes slideUp { from { transform: translate(-50%, 120%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
        @keyframes zoomIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes fadeInDown { from { transform: translateY(-50px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes glow { 0%, 100% { box-shadow: 0 0 20px rgba(34, 211, 238, 0.5); } 50% { box-shadow: 0 0 40px rgba(34, 211, 238, 0.8); } }
        .mask-linear-fade { mask-image: linear-gradient(to right, black 85%, transparent 100%); }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .animate-glow { animation: glow 2s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
