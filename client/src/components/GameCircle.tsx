import { useUsers, useGameCircle } from "@/hooks/use-users";
import { Bomb, User as UserIcon } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { queryClient } from "@/lib/queryClient";
import { api } from "@shared/routes";
import { type User } from "@shared/schema";

const SOUNDS = {
  tick: "https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3",
  explosion: "https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3",
  pass: "https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.mp3",
  victory: "https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3"
};

export function GameCircle() {
  const { data: users, isLoading } = useUsers();
  const { isConnected } = useGameCircle();
  const [bombPlayerId, setBombPlayerId] = useState<number | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [winner, setWinner] = useState<User | null>(null);
  const [explodingId, setExplodingId] = useState<number | null>(null);
  
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});

  useEffect(() => {
    // Preload sounds
    Object.entries(SOUNDS).forEach(([key, url]) => {
      const audio = new Audio(url);
      audio.load();
      audioRefs.current[key] = audio;
    });
  }, []);

  const playSound = (key: keyof typeof SOUNDS, playbackRate = 1) => {
    const audio = audioRefs.current[key];
    if (audio) {
      audio.currentTime = 0;
      audio.playbackRate = playbackRate;
      audio.play().catch(() => {}); // Ignore autoplay errors
    }
  };

  useEffect(() => {
    if (users && users.length === 1 && bombPlayerId === null && timeLeft === null) {
      setWinner(users[0]);
      playSound("victory");
      
      // Auto-reset after 5 seconds
      const timeout = setTimeout(async () => {
        try {
          await fetch("/api/game/reset", { method: "POST" });
        } catch (e) {
          console.error("Failed to reset game", e);
        }
      }, 5000);
      
      return () => clearTimeout(timeout);
    } else {
      setWinner(null);
    }
  }, [users, bombPlayerId, timeLeft]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (timeLeft !== null && timeLeft > 0) {
      // Play tick sound with increasing speed
      const speed = 1 + (30 - timeLeft) / 15; // Faster as time runs out
      playSound("tick", speed);

      timer = setInterval(() => {
        setTimeLeft(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
      }, 1000);
    } else if (timeLeft === 0 && bombPlayerId) {
      playSound("explosion");
      setExplodingId(bombPlayerId);
      
      // Screen shake effect handled via state/className on main container
      setTimeout(() => setExplodingId(null), 1000);

      // Trigger elimination
      fetch("/api/game/eliminate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: bombPlayerId }),
      }).catch(console.error);
      setBombPlayerId(null);
      setTimeLeft(null);
    }
    return () => clearInterval(timer);
  }, [timeLeft, bombPlayerId]);

  useEffect(() => {
    const socket = io({ path: "/socket.io" });
    socket.on("bomb_started", (data: { playerId: number }) => {
      const isNewRound = timeLeft === null;
      if (!isNewRound) {
        playSound("pass");
      }
      setBombPlayerId(data.playerId);
      setIsStarting(false);
      setTimeLeft(30);
    });
    socket.on("player_eliminated", () => {
      // Refresh users list via react-query
      queryClient.invalidateQueries({ queryKey: [api.users.list.path] });
    });
    socket.on("game_reset", () => {
      setBombPlayerId(null);
      setTimeLeft(null);
      setWinner(null);
      queryClient.invalidateQueries({ queryKey: [api.users.list.path] });
    });
    socket.on("game_winner", (winnerData: User) => {
      setWinner(winnerData);
      setBombPlayerId(null);
      setTimeLeft(null);
      playSound("victory");
      
      // Auto-restart after 5 seconds
      setTimeout(async () => {
        try {
          await fetch("/api/game/reset", { method: "POST" });
          setWinner(null);
        } catch (e) {
          console.error("Auto-restart failed", e);
        }
      }, 5000);
    });
    return () => {
      socket.disconnect();
    };
  }, [timeLeft]);

  const startBomb = async () => {
    setIsStarting(true);
    try {
      await fetch("/api/game/start-bomb", { method: "POST" });
    } catch (e) {
      console.error("Failed to start bomb", e);
      setIsStarting(false);
    }
  };

  const resetGame = async () => {
    try {
      await fetch("/api/game/clear-participants", { method: "POST" });
    } catch (e) {
      console.error("Failed to clear participants", e);
    }
  };

  const radius = 140; // Increased circle radius for larger avatars

  return (
    <section id="game-circle" className={`py-16 px-8 max-w-[1400px] mx-auto w-full transition-transform duration-100 ${explodingId ? 'animate-shake' : ''}`}>
      <div className="flex flex-col items-center gap-8">
        <h2 className="text-center text-[2.5rem] mb-4 relative pb-4 after:content-[''] after:absolute after:bottom-0 after:left-1/2 after:-translate-x-1/2 after:w-[100px] after:h-[4px] after:bg-gradient-to-r after:from-[#8a2be2] after:to-[#00ffff] after:rounded-sm">
          ساحة اللعب المباشرة
          <span className="block text-sm font-normal text-cyan-400 mt-2">
            {isConnected ? "🟢 متصل بالخادم" : "🔴 غير متصل"}
          </span>
        </h2>

        <div className="flex items-center gap-4">
          <button 
            onClick={startBomb}
            disabled={isStarting || !users?.length}
            className="btn-gradient text-white px-8 py-3 rounded-full font-bold flex items-center gap-2 transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            <Bomb size={20} />
            {isStarting ? "جاري البدء..." : "ابدأ القنبلة"}
          </button>
        </div>

        <div className="relative w-full max-w-[600px] aspect-square flex items-center justify-center bg-glass-card border border-purple-500/10 rounded-full">
          {winner && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-xl rounded-full animate-in fade-in zoom-in duration-500">
              <div className="relative mb-8 group">
                <div className="absolute -inset-4 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full blur-xl opacity-50 animate-pulse" />
                <div className="relative w-48 h-48 rounded-full p-1 bg-gradient-to-br from-yellow-400 via-orange-500 to-yellow-400 shadow-[0_0_50px_rgba(250,204,21,0.5)] animate-bounce-slow">
                  <div className="w-full h-full rounded-full bg-[#1a1f3a] overflow-hidden border-4 border-yellow-400">
                    {winner.avatarUrl ? (
                      <img src={winner.avatarUrl} alt={winner.username} className="w-full h-full object-cover scale-110" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-5xl font-black text-white uppercase">
                        {winner.username.slice(0, 2)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="absolute -top-6 -right-6 text-yellow-400 rotate-12 animate-wiggle">
                  <Bomb size={64} fill="currentColor" />
                </div>
              </div>
              
              <div className="text-center space-y-4 px-6 relative">
                <h3 className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-yellow-400 drop-shadow-2xl">
                  الفائز بالمباراة!
                </h3>
                <div className="text-3xl md:text-4xl font-bold text-cyan-400 tracking-tighter drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]">
                  {winner.username}
                </div>
                <div className="text-white/50 text-sm font-medium tracking-widest uppercase pt-4 animate-pulse">
                  سيبدأ التحدي التالي قريباً...
                </div>
              </div>
            </div>
          )}
          {timeLeft !== null && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center">
              <div className="text-8xl font-black text-white drop-shadow-[0_0_25px_rgba(0,255,255,0.7)] animate-pulse">
                {timeLeft}
              </div>
              <div className="text-cyan-400 font-black tracking-[0.2em] text-xl uppercase mt-4">
                ثانية
              </div>
            </div>
          )}
          {isLoading ? (
            <div className="text-[#b8b8ff]">جاري تحميل اللاعبين...</div>
          ) : !users || users.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-[#b8b8ff] gap-4 p-8 text-center">
              <UserIcon size={48} className="opacity-50" />
              <p>لا يوجد لاعبين نشطين حالياً. اكتب !دخول للانضمام!</p>
            </div>
          ) : (
            <div className="relative w-full h-full">
              {users.map((user, idx) => {
                const angle = (idx / users.length) * 2 * Math.PI - Math.PI / 2;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                const isHoldingBomb = bombPlayerId === user.id;

                return (
                  <div 
                    key={user.id} 
                    className="absolute transition-all duration-700 ease-out"
                    style={{ 
                      left: `calc(50% + ${x}px)`, 
                      top: `calc(50% + ${y}px)`,
                      transform: 'translate(-50%, -50%)'
                    }}
                  >
                    <div className="flex flex-col items-center gap-3">
                      <div className="relative group">
                        {/* ID Number Badge - MUCH LARGER and HIGH CONTRAST */}
                        <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-cyan-400 text-black text-xl font-black px-5 py-1.5 rounded-full border-2 border-white shadow-[0_0_25px_rgba(0,255,255,0.9)] z-[60] min-w-[60px] text-center pointer-events-none">
                          #{user.id}
                        </div>
                        
                        <div className={`relative w-28 h-28 rounded-full p-[4px] transition-all duration-300 ${
                          isHoldingBomb 
                            ? "bg-red-500 shadow-[0_0_40px_rgba(239,68,68,1)] scale-110 z-20" 
                            : "bg-gradient-to-br from-purple-500 to-cyan-400 shadow-[0_0_20px_rgba(138,43,226,0.4)]"
                        }`}>
                          <div className="w-full h-full rounded-full bg-[#1a1f3a] overflow-hidden flex items-center justify-center relative">
                            {user.avatarUrl ? (
                              <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-3xl font-black text-white uppercase">{user?.username?.slice(0, 2) || "??"}</span>
                            )}

                            {/* Explosion Overlay */}
                            {explodingId === user.id && (
                              <div className="absolute inset-0 bg-orange-500 animate-ping z-50 flex items-center justify-center">
                                <div className="absolute inset-0 bg-yellow-400 animate-pulse opacity-80" />
                              </div>
                            )}
                          </div>
                          {isHoldingBomb && (
                            <div className="absolute -top-8 -right-8 text-red-500 animate-bounce drop-shadow-[0_0_15px_rgba(239,68,68,0.9)] z-50">
                              <Bomb size={42} fill="currentColor" />
                            </div>
                          )}
                        </div>
                      </div>
                      <span className={`text-base font-bold truncate max-w-[120px] px-3 py-1.5 rounded-xl ${
                        isHoldingBomb ? "bg-red-500 text-white shadow-xl scale-110" : "text-white/90 bg-black/40 backdrop-blur-sm"
                      }`}>
                        {user.username}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
