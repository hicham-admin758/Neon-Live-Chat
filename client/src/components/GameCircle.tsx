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
      audio.volume = 0.6;
      audio.play().catch(e => console.log("Audio disabled"));
    } catch (e) {}
  };

  const handleStartGame = async () => {
    try {
      await apiRequest("POST", "/api/game/start-bomb");
      toast({ title: "انطلقت القنبلة! 💣" });
    } catch (e) {
      toast({ title: "خطأ", description: "لاعبين اثنين على الأقل", variant: "destructive" });
    }
  };

  const handleResetGame = async () => {
    try {
      await apiRequest("POST", "/api/game/reset");
      setWinner(null);
      setBombPlayerId(null);
      setTimeLeft(30);
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
      }, 1200);
    });

    socket.on("game_winner", (winnerUser: User) => {
      playSound("victory");
      setWinner(winnerUser);
      setBombPlayerId(null);

      setTimeout(() => {
        setWinner(null);
        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      }, 6000);
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

  // تكبير نصف القطر قليلاً لاستيعاب الأرقام الكبيرة
  const radius = activePlayers.length <= 5 ? 150 : activePlayers.length <= 10 ? 210 : 270;

  if (isLoading) return <div className="text-white text-center mt-20">جاري التحميل...</div>;

  // ✨ شاشة الفوز
  if (winner) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] w-full animate-in fade-in zoom-in duration-500">
        <div className="relative">
          <div className="absolute inset-0 bg-yellow-500 blur-[100px] opacity-30 animate-pulse"></div>
          <Trophy size={120} className="text-yellow-400 absolute -top-16 -right-16 animate-bounce z-50" />
          <div className="relative w-64 h-64 md:w-80 md:h-80 rounded-full border-[12px] border-yellow-500 shadow-[0_0_50px_rgba(234,179,8,0.5)] overflow-hidden bg-black">
            {winner.avatarUrl ? (
              <img src={winner.avatarUrl} alt={winner.username} className="w-full h-full object-cover scale-105" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-tr from-yellow-700 to-yellow-500 text-white text-8xl font-black">
                {winner.username.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>
        <div className="text-center mt-10 space-y-2">
          <h1 className="text-7xl font-black text-yellow-400 drop-shadow-2xl">{winner.username}</h1>
          <p className="text-3xl text-white font-bold tracking-widest uppercase opacity-80">البطل الفائز! 🏆</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center relative min-h-[80vh]">
      {/* شريط التحكم */}
      <div className="absolute top-0 flex gap-3 z-50 bg-black/40 backdrop-blur-xl p-2 rounded-2xl border border-white/10">
        <Button onClick={handleStartGame} disabled={activePlayers.length < 2 || !!bombPlayerId} className="bg-green-600 hover:bg-green-700">
          <Play size={18} className="ml-2" /> ابدأ
        </Button>
        <Button onClick={handleResetGame} variant="destructive">
          <RotateCcw size={18} className="ml-2" /> إعادة
        </Button>
        <div className="flex items-center px-4 bg-white/5 rounded-xl text-white font-bold">
          <Users size={16} className="ml-2 text-cyan-400" /> {activePlayers.length}
        </div>
      </div>

      {/* ساحة اللعب */}
      <div className="relative flex items-center justify-center w-full h-[650px] mt-10">

        {/* العداد */}
        <div className="absolute z-0">
          {bombPlayerId && (
            <div className={`w-32 h-32 rounded-full flex items-center justify-center border-4 transition-all duration-300 ${timeLeft <= 5 ? 'border-red-500 bg-red-500/20 scale-125 animate-pulse' : 'border-cyan-500/30 bg-black/50'}`}>
              <span className={`text-6xl font-black font-mono ${timeLeft <= 5 ? 'text-red-500' : 'text-cyan-400'}`}>{timeLeft}</span>
            </div>
          )}
        </div>

        {/* اللاعبين */}
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
                style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`, transform: 'translate(-50%, -50%)' }}
              >
                <div className="flex flex-col items-center gap-2 relative">

                  {/* 🔢 رقم اللاعب: كبير وواضح جداً */}
                  <div className="absolute -top-6 z-50 animate-in zoom-in duration-300">
                    <div className={`
                      px-3 py-1 rounded-lg border-2 shadow-[0_0_15px_rgba(0,0,0,0.8)]
                      font-black text-lg tracking-wider
                      ${isHoldingBomb 
                        ? 'bg-red-600 text-white border-red-400' 
                        : 'bg-cyan-950 text-cyan-300 border-cyan-500'}
                    `}>
                      #{user.id}
                    </div>
                  </div>

                  {/* دائرة الأفاتار */}
                  <div className={`relative w-20 h-20 rounded-full border-4 shadow-2xl transition-all duration-300 ${isHoldingBomb ? "border-red-500 scale-125 shadow-red-500/50" : "border-white/20 bg-gray-900"}`}>
                    <div className="w-full h-full rounded-full overflow-hidden">
                      {user.avatarUrl ? <img src={user.avatarUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white text-2xl font-bold">{user.username[0].toUpperCase()}</div>}
                    </div>
                    {isHoldingBomb && <Bomb size={45} className="absolute -bottom-4 -right-4 text-red-500 fill-red-600 animate-bounce" />}
                    {explodingId === user.id && <div className="absolute inset-0 flex items-center justify-center"><Skull size={60} className="text-white animate-ping" /></div>}
                  </div>

                  {/* اسم اللاعب */}
                  <div className={`mt-1 px-3 py-1 rounded-md text-xs font-bold max-w-[120px] truncate border ${isHoldingBomb ? 'bg-red-500/80 text-white border-red-500' : 'bg-black/70 text-gray-300 border-white/10'}`}>
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
