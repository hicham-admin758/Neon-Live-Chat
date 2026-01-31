import { useUsers } from "@/hooks/use-users";
import { Bomb, Trophy, Skull, Play, RotateCcw, Crown } from "lucide-react";
import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { type User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const SOUNDS = {
  tick: "https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3",
  explosion: "https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3",
  pass: "https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.mp3",
  victory: "https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3"
};

export function GameCircle() {
  const { data: users, isLoading } = useUsers();
  const { toast } = useToast();
  const [bombPlayerId, setBombPlayerId] = useState<number | null>(null);
  const [winner, setWinner] = useState<User | null>(null);
  const [explodingId, setExplodingId] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(30);

  // تشغيل الأصوات
  const playSound = (type: keyof typeof SOUNDS) => {
    try {
      const audio = new Audio(SOUNDS[type]);
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch (e) {}
  };

  // إعداد الـ Socket
  useEffect(() => {
    const socket = io(window.location.origin, { path: "/socket.io" });

    socket.on("bomb_started", ({ playerId, seconds }) => {
      setWinner(null);
      setBombPlayerId(playerId);
      if (seconds) setTimeLeft(seconds);
      playSound("pass");
    });

    socket.on("bomb_tick", ({ seconds }) => {
      setTimeLeft(seconds);
      if (seconds <= 5 || (seconds <= 10 && seconds % 2 === 0)) playSound("tick");
    });

    socket.on("player_eliminated", ({ playerId }) => {
      playSound("explosion");
      setExplodingId(playerId);
      setTimeout(() => {
        setExplodingId(null);
        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      }, 1500);
    });

    socket.on("game_winner", (winnerUser: User) => {
      playSound("victory");
      setWinner(winnerUser);
      setBombPlayerId(null);

      // ✅ التعديل المطلوب: الانتظار 8 ثواني
      setTimeout(() => {
        setWinner(null);
        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      }, 8000);
    });

    socket.on("game_reset", () => {
      setWinner(null);
      setBombPlayerId(null);
      setTimeLeft(30);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    });

    return () => { socket.disconnect(); };
  }, []);

  const activePlayers = users?.filter(u => u.lobbyStatus === "active") || [];

  // توسيع الدائرة لاستيعاب التصميم الجديد
  const radius = activePlayers.length <= 5 ? 170 : activePlayers.length <= 10 ? 230 : 290;

  if (isLoading) return <div className="text-white text-center mt-20 animate-pulse">جاري تحميل الساحة...</div>;

  // ✨ شاشة الفوز (تظهر لمدة 8 ثواني)
  if (winner) {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/95 backdrop-blur-xl animate-in zoom-in duration-700">
        <div className="relative">
           {/* توهج خلفي */}
           <div className="absolute inset-0 bg-yellow-500/30 blur-[150px] animate-pulse"></div>

           <Crown size={100} className="text-yellow-400 absolute -top-20 left-1/2 -translate-x-1/2 animate-bounce drop-shadow-[0_0_15px_rgba(250,204,21,0.8)]" />

           <div className="relative w-72 h-72 rounded-full p-2 bg-gradient-to-b from-yellow-300 to-yellow-700 shadow-[0_0_60px_rgba(234,179,8,0.6)]">
              <div className="w-full h-full rounded-full overflow-hidden border-4 border-black bg-black">
                {winner.avatarUrl ? (
                   <img src={winner.avatarUrl} className="w-full h-full object-cover" />
                ) : (
                   <div className="w-full h-full flex items-center justify-center bg-gray-900 text-8xl font-black text-yellow-500">
                     {winner.username[0].toUpperCase()}
                   </div>
                )}
              </div>
           </div>
        </div>

        <div className="mt-8 text-center space-y-4 relative z-10">
          <h1 className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-500 to-yellow-200 drop-shadow-sm">
            {winner.username}
          </h1>
          <div className="inline-block bg-yellow-500/20 px-8 py-2 rounded-full border border-yellow-500/50">
            <p className="text-3xl text-white font-bold tracking-[0.3em] uppercase">الفائز الأسطوري 🏆</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center relative min-h-[90vh] justify-center overflow-hidden bg-[#0a0a0a]">

      {/* 🎮 أزرار التحكم العلوية */}
      <div className="absolute top-6 z-[100] flex items-center gap-4 bg-black/40 backdrop-blur-md p-3 rounded-2xl border border-white/10 shadow-2xl">
        <Button onClick={() => apiRequest("POST", "/api/game/start-bomb")} className="bg-green-600 hover:bg-green-700 shadow-lg shadow-green-900/20 font-bold px-6">
          <Play size={20} className="mr-2" /> ابدأ اللعب
        </Button>
        <Button onClick={() => apiRequest("POST", "/api/game/reset")} variant="destructive" className="font-bold px-6 shadow-lg shadow-red-900/20">
          <RotateCcw size={20} className="mr-2" /> إعادة
        </Button>
        <div className="bg-white/5 px-4 py-2 rounded-xl border border-white/10 flex items-center gap-2 text-white font-mono font-bold">
          <Users size={18} className="text-cyan-400" />
          <span>{activePlayers.length}</span>
        </div>
      </div>

      <div className="relative flex items-center justify-center w-full h-[800px]">

        {/* ✨ الدائرة المنقطة (الخلفية) - تم تحسين الوضوح */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
           {/* الدائرة الخارجية المتحركة */}
           <div 
             className="rounded-full border-[3px] border-dashed border-cyan-500/20 animate-[spin_60s_linear_infinite]"
             style={{ width: radius * 2.2, height: radius * 2.2 }}
           />
           {/* دائرة داخلية ثابتة للزينة */}
           <div 
             className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/5"
             style={{ width: radius * 1.8, height: radius * 1.8 }}
           />
        </div>

        {/* ⏲️ العداد المركزي (Timer) */}
        <div className="absolute z-0 flex items-center justify-center">
          {bombPlayerId ? (
            <div className={`relative flex items-center justify-center w-40 h-40 rounded-full border-[6px] backdrop-blur-sm transition-all duration-300 
              ${timeLeft <= 5 
                ? 'border-red-600 bg-red-950/30 shadow-[0_0_50px_rgba(220,38,38,0.4)] scale-110 animate-pulse' 
                : 'border-cyan-500/30 bg-black/40 shadow-[0_0_30px_rgba(6,182,212,0.1)]'}
            `}>
              <span className={`text-7xl font-black font-mono tracking-tighter ${timeLeft <= 5 ? 'text-red-500' : 'text-cyan-400'}`}>
                {timeLeft}
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center opacity-40 animate-pulse">
              <div className="w-32 h-32 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center">
                 <span className="text-white font-bold">انتظار...</span>
              </div>
            </div>
          )}
        </div>

        {/* 👥 منطقة اللاعبين */}
        <div className="relative w-full h-full">
          {activePlayers.map((user, index) => {
            const angle = (index / activePlayers.length) * 2 * Math.PI - Math.PI / 2;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            const isHoldingBomb = bombPlayerId === user.id;

            return (
              <div
                key={user.id}
                className="absolute top-1/2 left-1/2 transition-all duration-500 ease-out"
                style={{ 
                  left: `calc(50% + ${x}px)`, 
                  top: `calc(50% + ${y}px)`, 
                  transform: 'translate(-50%, -50%)',
                  zIndex: isHoldingBomb ? 50 : 10
                }}
              >
                <div className="flex flex-col items-center relative group">

                  {/* 🔢 رقم اللاعب: تصميم جديد وعصري */}
                  <div className={`
                    absolute -top-12 z-20 transition-all duration-300
                    ${isHoldingBomb ? 'scale-125 -translate-y-2' : ''}
                  `}>
                    <div className={`
                      px-3 py-1 rounded-xl backdrop-blur-md border-2 shadow-lg flex flex-col items-center
                      ${isHoldingBomb 
                        ? 'bg-red-600/90 border-red-400 text-white shadow-red-600/50' 
                        : 'bg-slate-900/80 border-cyan-500/30 text-cyan-400 shadow-cyan-900/50'}
                    `}>
                      <span className="text-[10px] uppercase font-bold opacity-70 leading-none mb-0.5">Player</span>
                      <span className="text-xl font-black leading-none">#{user.id}</span>
                    </div>
                  </div>

                  {/* 🖼️ دائرة الأفاتار */}
                  <div className={`
                    relative w-24 h-24 rounded-full border-[4px] shadow-2xl transition-all duration-300
                    ${isHoldingBomb 
                      ? "border-red-500 shadow-[0_0_50px_rgba(239,68,68,0.6)] scale-110" 
                      : "border-white/10 bg-black group-hover:border-white/30 group-hover:scale-105"}
                  `}>
                    <div className="w-full h-full rounded-full overflow-hidden bg-gray-900">
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white text-3xl font-bold bg-gradient-to-br from-gray-800 to-black">
                          {user.username[0].toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* 💣 أيقونة القنبلة */}
                    {isHoldingBomb && (
                      <div className="absolute -bottom-3 -right-3 z-30 animate-bounce">
                        <Bomb size={50} className="text-red-500 fill-red-700 drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]" />
                      </div>
                    )}

                    {/* 💀 تأثير الانفجار */}
                    {explodingId === user.id && (
                       <div className="absolute inset-0 z-[60] flex items-center justify-center">
                         <div className="absolute inset-0 bg-red-600 rounded-full animate-ping"></div>
                         <Skull size={60} className="text-white relative z-10 animate-spin" />
                       </div>
                    )}
                  </div>

                  {/* 🏷️ اسم اللاعب */}
                  <div className={`
                    mt-2 px-4 py-1.5 rounded-lg text-sm font-bold border backdrop-blur-md max-w-[140px] truncate text-center shadow-lg transition-colors
                    ${isHoldingBomb 
                      ? 'bg-red-950/80 text-red-100 border-red-500/50' 
                      : 'bg-black/60 text-gray-300 border-white/5'}
                  `}>
                    {user.username}
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
