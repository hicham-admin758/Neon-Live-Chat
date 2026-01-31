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
      setTimeLeft(30); 
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });

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

  // تصفية اللاعبين النشطين فقط
  const activePlayers = users?.filter(u => u.lobbyStatus === "active") || [];

  // حساب نصف القطر ديناميكياً بناءً على عدد اللاعبين
  const getRadius = () => {
    const count = activePlayers.length;
    if (count <= 5) return 130;
    if (count <= 10) return 180;
    if (count <= 20) return 240;
    return 280;
  };

  const radius = getRadius();

  // === شاشة التحميل ===
  if (isLoading) {
    return <div className="text-white text-center mt-20 font-bold animate-pulse">جاري تحميل الساحة...</div>;
  }

  // === شاشة الفوز ===
  if (winner) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] animate-in zoom-in duration-700">
        <Trophy size={180} className="text-yellow-400 drop-shadow-[0_0_40px_rgba(250,204,21,0.7)] animate-bounce mb-8" />
        <h2 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-500 to-yellow-200 mb-4">
          {winner.username}
        </h2>
        <p className="text-4xl text-white font-black tracking-[0.2em] uppercase">الفائز!</p>
      </div>
    );
  }

  // === ساحة اللعب ===
  return (
    <div className="w-full flex flex-col items-center relative min-h-[80vh] overflow-hidden">

      {/* 🎮 أزرار التحكم العلوية */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-4 z-50 bg-black/50 backdrop-blur-md p-2 rounded-full border border-white/10 shadow-lg">
        <Button 
          onClick={handleStartGame} 
          disabled={activePlayers.length < 2 || bombPlayerId !== null}
          className="bg-green-600 hover:bg-green-700 text-white font-bold px-6"
        >
          <Play className="mr-2 h-4 w-4" /> ابدأ
        </Button>

        <Button 
          onClick={handleResetGame} 
          variant="destructive"
          className="font-bold px-6"
        >
          <RotateCcw className="mr-2 h-4 w-4" /> إعادة
        </Button>

        <div className="flex items-center gap-2 px-4 text-white font-mono border-r border-white/20">
          <Users size={16} />
          <span>{activePlayers.length}</span>
        </div>
      </div>

      {/* منطقة اللعبة الرئيسية */}
      <div className="relative flex items-center justify-center w-full h-[600px] mt-16">

        {/* الخلفية الدائرية (زينة) */}
        <div 
          className="absolute rounded-full border-2 border-dashed border-white/10 animate-[spin_60s_linear_infinite]"
          style={{ width: radius * 2.5, height: radius * 2.5 }}
        />

        {/* 💣 مؤقت القنبلة المركزي (ثابت في المنتصف) */}
        <div className="absolute z-20 flex flex-col items-center justify-center pointer-events-none">
          {bombPlayerId ? (
            <div className={`relative flex items-center justify-center w-32 h-32 rounded-full border-4 backdrop-blur-xl transition-all duration-300 ${timeLeft <= 10 ? 'border-red-500 bg-red-500/10 scale-110 animate-pulse' : 'border-cyan-500/30 bg-black/40'}`}>
              <div className={`text-6xl font-black font-mono leading-none ${timeLeft <= 10 ? 'text-red-500' : 'text-cyan-400'}`}>
                {timeLeft}
              </div>
            </div>
          ) : (
            <div className="text-white/30 text-xl font-bold animate-pulse">انتظار...</div>
          )}
        </div>

        {/* 👥 حاوية اللاعبين */}
        <div className="absolute w-full h-full">
          {activePlayers.map((user, index) => {
            const total = activePlayers.length;
            // حساب الزاوية: نبدأ من -90 درجة (الأعلى)
            const angle = (index / total) * 2 * Math.PI - Math.PI / 2;

            // حساب الإحداثيات بالنسبة للمنتصف (بدون قيم ثابتة زائدة)
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;

            const isHoldingBomb = bombPlayerId === user.id;
            const isExploding = explodingId === user.id;

            return (
              <div
                key={user.id}
                className={`absolute top-1/2 left-1/2 transition-all duration-700 ease-out
                  ${isExploding ? "z-50" : "z-10"}
                `}
                style={{ 
                  // ✅ الإصلاح الرئيسي هنا: نستخدم left/top مع calc لضمان التمركز الصحيح
                  left: `calc(50% + ${x}px)`,
                  top: `calc(50% + ${y}px)`,
                  transform: 'translate(-50%, -50%)', // لتوسيط العنصر نفسه في نقطته
                }}
              >
                <div className="flex flex-col items-center gap-2 relative group">

                  {/* دائرة اللاعب (Avatar) */}
                  <div className={`relative w-16 h-16 rounded-full border-4 shadow-xl overflow-visible transition-all duration-300
                    ${isHoldingBomb ? "border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.6)] scale-125" : "border-white/20 bg-black hover:scale-110"}
                  `}>

                    {/* رقم اللاعب */}
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
                        <span className="bg-cyan-900/80 text-cyan-200 text-xs font-bold px-2 py-0.5 rounded-full border border-cyan-500/30">
                          #{user.id}
                        </span>
                    </div>

                    {/* الصورة */}
                    <div className="w-full h-full rounded-full overflow-hidden bg-gray-900">
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white font-bold text-2xl">
                           {user.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* أيقونة القنبلة إذا كانت معه */}
                    {isHoldingBomb && (
                      <div className="absolute -bottom-4 -right-4 z-30 animate-bounce">
                        <Bomb size={40} className="text-red-500 fill-red-600 drop-shadow-lg" />
                      </div>
                    )}

                    {/* تأثير الانفجار */}
                    {isExploding && (
                      <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none scale-150">
                         <Skull size={60} className="text-white animate-ping absolute" />
                         <div className="w-32 h-32 bg-orange-600 rounded-full animate-ping opacity-75"></div>
                      </div>
                    )}
                  </div>

                  {/* اسم اللاعب */}
                  <div className={`px-3 py-1 rounded-md backdrop-blur-sm transition-all duration-300 ${isHoldingBomb ? 'bg-red-900/50' : 'bg-black/60'}`}>
                    <p className={`font-bold text-sm truncate max-w-[100px] text-center ${isHoldingBomb ? 'text-red-200' : 'text-gray-200'}`}>
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
