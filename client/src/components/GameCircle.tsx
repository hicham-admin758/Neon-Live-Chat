import { useUsers } from "@/hooks/use-users";
import { Bomb, Trophy, Skull, Play, RotateCcw, Users } from "lucide-react";
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

  const playSound = (type: keyof typeof SOUNDS) => {
    try {
      const audio = new Audio(SOUNDS[type]);
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch (e) {}
  };

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
      setTimeout(() => {
        setWinner(null);
        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      }, 7000);
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

  // ضبط القطر بناءً على حجم الشاشة وعدد اللاعبين
  const radius = activePlayers.length <= 5 ? 160 : activePlayers.length <= 12 ? 220 : 280;

  if (isLoading) return <div className="text-white text-center mt-20 animate-pulse">جاري التحميل...</div>;

  if (winner) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] animate-in zoom-in duration-500">
        <div className="relative p-8">
           <div className="absolute inset-0 bg-yellow-500/20 blur-[120px] rounded-full animate-pulse"></div>
           <Trophy size={140} className="text-yellow-400 drop-shadow-2xl mb-6 relative z-10" />
           <div className="w-64 h-64 rounded-full border-8 border-yellow-500 shadow-2xl overflow-hidden relative z-10">
              {winner.avatarUrl ? <img src={winner.avatarUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-yellow-600 flex items-center justify-center text-8xl font-black">{winner.username[0]}</div>}
           </div>
        </div>
        <h1 className="text-6xl font-black text-yellow-400 mt-6">{winner.username}</h1>
        <p className="text-2xl text-white font-bold tracking-tighter opacity-70">🏆 الفائز الأخير 🏆</p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center relative min-h-[85vh] justify-center overflow-hidden">

      {/* 🔘 أزرار التحكم */}
      <div className="absolute top-4 flex gap-3 z-[100] bg-black/60 backdrop-blur-md p-2 rounded-2xl border border-white/20">
        <Button onClick={() => apiRequest("POST", "/api/game/start-bomb")} className="bg-green-600 hover:bg-green-700 font-bold">
          <Play size={18} className="ml-2" /> ابدأ
        </Button>
        <Button onClick={() => apiRequest("POST", "/api/game/reset")} variant="destructive" className="font-bold">
          <RotateCcw size={18} className="ml-2" /> إعادة
        </Button>
      </div>

      <div className="relative flex items-center justify-center w-full h-[700px]">

        {/* ✨ الدائرة المنقطة المحسنة ✨ */}
        <div 
          className="absolute rounded-full border-[3px] border-dashed border-white/20 animate-[spin_100s_linear_infinite]"
          style={{ width: radius * 2, height: radius * 2 }}
        />
        <div 
          className="absolute rounded-full border border-cyan-500/10"
          style={{ width: (radius * 2) + 40, height: (radius * 2) + 40 }}
        />

        {/* ⏲️ العداد المركزي */}
        <div className="absolute z-10 flex flex-col items-center justify-center">
          {bombPlayerId ? (
            <div className={`w-36 h-36 rounded-full flex items-center justify-center border-4 shadow-2xl transition-all duration-300 ${timeLeft <= 5 ? 'border-red-600 bg-red-600/20 scale-110 shadow-red-600/40' : 'border-cyan-500/40 bg-black/60 shadow-cyan-500/20'}`}>
              <span className={`text-7xl font-black font-mono leading-none ${timeLeft <= 5 ? 'text-red-500' : 'text-cyan-400'}`}>
                {timeLeft}
              </span>
            </div>
          ) : (
            <div className="text-white/20 font-bold text-xl uppercase tracking-widest animate-pulse">في انتظار البداية</div>
          )}
        </div>

        {/* 👥 توزيع اللاعبين */}
        <div className="relative w-full h-full">
          {activePlayers.map((user, index) => {
            const angle = (index / activePlayers.length) * 2 * Math.PI - Math.PI / 2;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            const isHoldingBomb = bombPlayerId === user.id;

            return (
              <div
                key={user.id}
                className="absolute top-1/2 left-1/2 transition-all duration-700"
                style={{ 
                  left: `calc(50% + ${x}px)`, 
                  top: `calc(50% + ${y}px)`, 
                  transform: 'translate(-50%, -50%)',
                  zIndex: isHoldingBomb ? 50 : 10
                }}
              >
                <div className="flex flex-col items-center gap-3 relative group">

                  {/* 🔢 رقم اللاعب الضخم */}
                  <div className={`
                    absolute -top-10 px-4 py-1 rounded-xl border-2 font-black text-xl shadow-2xl transition-all
                    ${isHoldingBomb ? 'bg-red-600 border-red-300 text-white scale-125' : 'bg-cyan-900 border-cyan-500 text-cyan-200'}
                  `}>
                    #{user.id}
                  </div>

                  {/* 🖼️ صورة اللاعب */}
                  <div className={`
                    relative w-20 h-20 md:w-24 md:h-24 rounded-full border-4 transition-all duration-500
                    ${isHoldingBomb ? "border-red-500 scale-110 shadow-[0_0_40px_rgba(239,68,68,0.8)]" : "border-white/30 bg-gray-900 shadow-xl group-hover:border-white/60"}
                  `}>
                    <div className="w-full h-full rounded-full overflow-hidden">
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white text-3xl font-bold bg-gradient-to-br from-gray-700 to-black">
                          {user.username[0].toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* القنبلة */}
                    {isHoldingBomb && (
                      <div className="absolute -bottom-2 -right-2 animate-bounce">
                        <Bomb size={45} className="text-red-500 fill-black drop-shadow-[0_0_10px_rgba(255,0,0,1)]" />
                      </div>
                    )}

                    {/* الانفجار */}
                    {explodingId === user.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-orange-600 rounded-full animate-ping scale-150 z-[60]">
                         <Skull size={60} className="text-white" />
                      </div>
                    )}
                  </div>

                  {/* 🏷️ الاسم */}
                  <div className={`px-4 py-1 rounded-full text-sm font-black border backdrop-blur-md ${isHoldingBomb ? 'bg-red-600 text-white border-red-400' : 'bg-black/80 text-gray-200 border-white/10'}`}>
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
