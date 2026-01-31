import { useUsers } from "@/hooks/use-users";
import { Bomb, Trophy, Skull, Play, RotateCcw, Users } from "lucide-react";
import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { type User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

// روابط الأصوات
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
      audio.volume = 0.6;
      audio.play().catch(e => console.log("Audio play failed", e));
    } catch (e) {
      console.error("Sound error", e);
    }
  };

  // التحكم في اللعبة
  const handleStartGame = async () => {
    try {
      await apiRequest("POST", "/api/game/start-bomb");
      toast({ title: "بدأت اللعبة!", description: "القنبلة انطلقت الآن 💣" });
    } catch (e) {
      toast({ title: "خطأ", description: "يجب وجود لاعبين اثنين على الأقل", variant: "destructive" });
    }
  };

  const handleResetGame = async () => {
    try {
      await apiRequest("POST", "/api/game/reset");
      setWinner(null);
      setBombPlayerId(null);
      setExplodingId(null);
      setTimeLeft(30);
      toast({ title: "تمت إعادة التعيين", description: "اللعبة جاهزة لجولة جديدة" });
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const socket = io(window.location.origin, { path: "/socket.io" });

    socket.on("bomb_started", ({ playerId, seconds }) => {
      console.log(`💣 Bomb passed to: ${playerId}`);
      if (bombPlayerId !== playerId) {
        playSound("pass");
        setBombPlayerId(playerId);
        setWinner(null);
        if (seconds) setTimeLeft(seconds);
      }
    });

    socket.on("bomb_tick", ({ seconds }) => {
      setTimeLeft(seconds);
      if (seconds <= 5) {
        playSound("tick");
      } else if (seconds <= 10 && seconds % 2 === 0) {
        playSound("tick");
      }
    });

    socket.on("player_eliminated", ({ playerId }) => {
      console.log(`💥 Eliminated: ${playerId}`);
      playSound("explosion");
      setExplodingId(playerId);

      setBombPlayerId(prev => prev === playerId ? null : prev);

      setTimeout(() => {
        setExplodingId(null);
        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      }, 1500);
    });

    socket.on("game_winner", (winnerUser: User) => {
      console.log(`🏆 Winner: ${winnerUser.username}`);
      playSound("victory");
      setWinner(winnerUser);
      setBombPlayerId(null);
      setTimeLeft(30); // Reset timer on winner
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      
      // Auto-restart handling is already in backend, 
      // but we ensure UI reflects state after 5 seconds
      setTimeout(() => {
        setWinner(null);
        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      }, 5500);
    });

    socket.on("game_reset", () => {
      setWinner(null);
      setBombPlayerId(null);
      setExplodingId(null);
      setTimeLeft(30);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    });

    socket.on("new_player", () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    });

    return () => {
      socket.disconnect();
    };
  }, [bombPlayerId]);

  // حساب نصف القطر
  const activePlayers = users?.filter(u => u.lobbyStatus === "active") || [];

  const getRadius = () => {
    const count = activePlayers.length;
    // Dynamic radius based on player count, but capped for computer screens
    const baseRadius = Math.min(window.innerWidth * 0.35, window.innerHeight * 0.35);
    if (count <= 5) return baseRadius * 0.8;
    if (count <= 10) return baseRadius;
    return baseRadius * 1.2;
  };

  const radius = getRadius();

  // === حالة التحميل ===
  if (isLoading) {
    return <div className="text-white text-center mt-20">جاري تحميل الساحة...</div>;
  }

  // === شاشة الفوز ===
  if (winner) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] animate-in zoom-in duration-700">
        <div className="relative mb-12 group">
          {/* Animated Glow Rings */}
          <div className="absolute inset-0 rounded-full bg-yellow-400 blur-3xl opacity-30 animate-pulse group-hover:opacity-50 transition-opacity" />
          <div className="absolute inset-0 rounded-full border-4 border-yellow-400/20 scale-125 animate-[ping_3s_linear_infinite]" />
          
          <Trophy size={180} className="text-yellow-400 absolute -top-24 -left-24 -rotate-12 drop-shadow-[0_0_40px_rgba(250,204,21,0.7)] animate-bounce z-20" />
          
          <div className="relative w-72 h-72 rounded-full border-[10px] border-yellow-400 overflow-hidden shadow-[0_0_60px_rgba(250,204,21,0.5)] z-10 bg-black/40 backdrop-blur-sm">
            {winner.avatarUrl ? (
              <img src={winner.avatarUrl} alt={winner.username} className="w-full h-full object-cover scale-110 group-hover:scale-125 transition-transform duration-700" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-yellow-600 to-orange-700 text-white text-7xl font-black">
                {winner.username.charAt(0)}
              </div>
            )}
          </div>
        </div>
        
        <div className="text-center space-y-4">
          <h2 className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-500 to-yellow-200 animate-gradient-x mb-2">
            {winner.username}
          </h2>
          <div className="flex items-center justify-center gap-4">
            <div className="h-px w-12 bg-gradient-to-r from-transparent to-yellow-400" />
            <p className="text-4xl text-white font-black tracking-[0.2em] uppercase">Champion</p>
            <div className="h-px w-12 bg-gradient-to-l from-transparent to-yellow-400" />
          </div>
        </div>

        <div className="mt-12 bg-white/5 backdrop-blur-xl px-10 py-4 rounded-2xl border border-white/10 shadow-2xl animate-pulse">
           <div className="flex items-center gap-3">
             <RotateCcw className="text-cyan-400 animate-spin-slow" />
             <p className="text-white/80 font-bold text-lg tracking-wide">تبدأ جولة جديدة تلقائياً...</p>
           </div>
        </div>
      </div>
    );
  }

  // === ساحة اللعب ===
  return (
    <div className="w-full flex flex-col items-center relative min-h-[80vh]">
      
      {/* 💣 مؤقت القنبلة المركزي - Perfectly Centered and Stable */}
      {bombPlayerId && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center z-40 pointer-events-none">
          <div className="relative flex items-center justify-center">
            {/* Outer Glow Ring */}
            <div className={`absolute w-32 h-32 md:w-40 md:h-40 rounded-full blur-2xl opacity-40 transition-colors duration-500 ${timeLeft <= 10 ? 'bg-red-500 animate-pulse' : 'bg-cyan-500'}`} />
            
            {/* Timer Display */}
            <div className={`relative z-10 flex flex-col items-center justify-center w-28 h-28 md:w-36 md:h-36 rounded-full border-4 backdrop-blur-xl transition-all duration-300 ${timeLeft <= 10 ? 'border-red-500/50 bg-red-500/10 scale-110' : 'border-cyan-500/30 bg-black/40'}`}>
              <div className={`text-4xl md:text-6xl font-black font-mono leading-none transition-colors duration-300 ${timeLeft <= 10 ? 'text-red-500' : 'text-cyan-400'}`}>
                {timeLeft}
              </div>
              <div className="text-[8px] md:text-[10px] text-white/40 font-bold uppercase tracking-[0.2em] mt-1">Seconds</div>
            </div>
          </div>
        </div>
      )}

      {/* 🎮 لوحة التحكم العلوية */}
      <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex gap-4 z-50 bg-black/50 backdrop-blur-md p-2 rounded-full border border-white/10">
        <Button 
          onClick={handleStartGame} 
          disabled={activePlayers.length < 2 || bombPlayerId !== null}
          className="bg-green-600 hover:bg-green-700 text-white font-bold"
        >
          <Play className="mr-2 h-4 w-4" /> ابدأ
        </Button>

        <Button 
          onClick={handleResetGame} 
          variant="destructive"
          className="font-bold"
        >
          <RotateCcw className="mr-2 h-4 w-4" /> إعادة
        </Button>

        <div className="flex items-center gap-2 px-4 text-white font-mono border-r border-white/20">
          <Users size={16} />
          <span>{activePlayers.length}</span>
        </div>
      </div>

      {/* منطقة اللعب */}
      <div className="relative flex items-center justify-center py-20 mt-10">

        {/* حالة الانتظار إذا لم يوجد لاعبين */}
        {activePlayers.length === 0 && (
          <div className="absolute text-center z-10">
             <div className="animate-pulse text-white/50 text-xl font-bold">بانتظار انضمام اللاعبين...</div>
             <p className="text-sm text-white/30 mt-2">اكتب "دخول" في شات اليوتيوب</p>
          </div>
        )}

        {/* الخلفية الدائرية */}
        <div 
          className="absolute rounded-full border-4 border-dashed border-white/10 animate-[spin_60s_linear_infinite]"
          style={{ width: radius * 2.5, height: radius * 2.5 }}
        />

        {/* حاوية اللاعبين */}
        <div 
          className="relative transition-all duration-1000 ease-out"
          style={{ width: radius * 2, height: radius * 2 }}
        >
          {activePlayers.map((user, index) => {
            const total = activePlayers.length;
            const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;

            const isHoldingBomb = bombPlayerId === user.id;
            const isExploding = explodingId === user.id;

            return (
              <div
                key={user.id}
                className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-1000 ease-in-out
                  ${isExploding ? "scale-150 z-50" : "hover:scale-105 z-10"}
                  animate-float
                `}
                style={{ 
                  transform: `translate(${x}px, ${y}px) translate(-50%, -50%)`,
                  animationDelay: `${index * 0.2}s`
                }}
              >
                <div className="flex flex-col items-center gap-2 relative">

                  {/* Avatar Circle */}
                  <div className={`relative w-14 h-14 md:w-20 md:h-20 rounded-full border-4 shadow-2xl overflow-visible transition-all duration-300
                    ${isHoldingBomb ? "border-red-500 shadow-[0_0_40px_rgba(239,68,68,0.6)] animate-pulse scale-110" : "border-white/20 bg-black"}
                  `}>
                    {/* Badge ID */}
                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-50">
                        <span className={`transition-all duration-300 font-black text-lg px-2 py-0.5 rounded-md shadow-lg border ${isHoldingBomb ? 'bg-red-500 text-white border-red-400 shadow-red-500/50' : 'bg-cyan-400 text-black border-white shadow-cyan-400/50'}`}>
                          #{user.id}
                        </span>
                    </div>

                    <div className="w-full h-full rounded-full overflow-hidden">
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt={user.username} className={`w-full h-full object-cover transition-transform duration-500 ${isHoldingBomb ? 'scale-125' : 'hover:scale-110'}`} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-800 text-white">
                           <span className="font-bold text-2xl">{user.username.charAt(0)}</span>
                        </div>
                      )}
                    </div>

                    {isHoldingBomb && (
                      <div className="absolute -bottom-6 -right-6 z-50 animate-bounce">
                        <Bomb size={48} className="text-red-500 fill-red-600 drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]" />
                      </div>
                    )}

                    {isExploding && (
                      <div className="absolute inset-0 -m-10 flex items-center justify-center z-50 pointer-events-none">
                         <Skull size={80} className="text-white animate-ping absolute" />
                         <div className="w-40 h-40 bg-orange-500 rounded-full animate-ping opacity-75"></div>
                      </div>
                    )}
                  </div>

                  {/* Name Tag */}
                  <div className={`backdrop-blur-md px-3 py-1 rounded-lg border max-w-[140px] transition-all duration-300 ${isHoldingBomb ? 'bg-red-500/20 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-black/80 border-white/20'}`}>
                    <p className={`font-bold text-sm truncate text-center dir-rtl transition-colors duration-300 ${isHoldingBomb ? 'text-red-400' : 'text-white'}`}>
                      {user.username}
                    </p>
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
