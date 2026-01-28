import { useUsers, useGameCircle } from "@/hooks/use-users";
import { Bomb } from "lucide-react";
import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { queryClient } from "@/lib/queryClient";
import { api } from "@shared/routes";
import { type User } from "@shared/schema";

export function GameCircle() {
  const { data: users, isLoading } = useUsers();
  const { isConnected } = useGameCircle();
  const [bombPlayerId, setBombPlayerId] = useState<number | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [winner, setWinner] = useState<User | null>(null);

  useEffect(() => {
    if (users && users.length === 1 && bombPlayerId === null && timeLeft === null) {
      setWinner(users[0]);
      
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
      timer = setInterval(() => {
        setTimeLeft(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
      }, 1000);
    } else if (timeLeft === 0 && bombPlayerId) {
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
    return () => {
      socket.disconnect();
    };
  }, []);

  const startBomb = async () => {
    setIsStarting(true);
    try {
      await fetch("/api/game/start-bomb", { method: "POST" });
    } catch (e) {
      console.error("Failed to start bomb", e);
      setIsStarting(false);
    }
  };

  const radius = 120; // Circle radius

  return (
    <section id="game-circle" className="py-16 px-8 max-w-[1400px] mx-auto w-full">
      <div className="flex flex-col items-center gap-8">
        <h2 className="text-center text-[2.5rem] mb-4 relative pb-4 after:content-[''] after:absolute after:bottom-0 after:left-1/2 after:-translate-x-1/2 after:w-[100px] after:h-[4px] after:bg-gradient-to-r after:from-[#8a2be2] after:to-[#00ffff] after:rounded-sm">
          ساحة اللعب المباشرة
          <span className="block text-sm font-normal text-cyan-400 mt-2">
            {isConnected ? "🟢 متصل بالخادم" : "🔴 غير متصل"}
          </span>
        </h2>

        <button 
          onClick={startBomb}
          disabled={isStarting || !users?.length}
          className="btn-gradient text-white px-8 py-3 rounded-full font-bold flex items-center gap-2 transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
        >
          <Bomb size={20} />
          {isStarting ? "جاري البدء..." : "ابدأ القنبلة"}
        </button>

        <div className="relative w-full max-w-[500px] aspect-square flex items-center justify-center bg-glass-card border border-purple-500/10 rounded-full">
          {winner && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md rounded-full animate-in fade-in zoom-in duration-500">
              <div className="text-yellow-400 animate-bounce mb-4">
                <Bomb size={64} fill="currentColor" className="rotate-12" />
              </div>
              <h3 className="text-4xl font-black text-white mb-2 text-center px-4">
                مبروك الفوز!
              </h3>
              <div className="text-2xl font-bold text-cyan-400 mb-6 uppercase tracking-widest">
                {winner.username}
              </div>
              <button 
                onClick={() => setWinner(null)}
                className="btn-gradient text-white px-8 py-2 rounded-full font-bold text-sm"
              >
                إغلاق
              </button>
            </div>
          )}
          {timeLeft !== null && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center">
              <div className="text-6xl font-black text-white drop-shadow-[0_0_15px_rgba(0,255,255,0.5)] animate-pulse">
                {timeLeft}
              </div>
              <div className="text-cyan-400 font-bold tracking-widest text-sm uppercase mt-2">
                ثانية
              </div>
            </div>
          )}
          {isLoading ? (
            <div className="text-[#b8b8ff]">جاري تحميل اللاعبين...</div>
          ) : !users || users.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-[#b8b8ff] gap-4 p-8 text-center">
              <User size={48} className="opacity-50" />
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
                    <div className="flex flex-col items-center gap-2">
                      <div className="relative group">
                        {/* ID Number Badge */}
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-cyan-500 text-black text-xs font-bold px-2 py-0.5 rounded-full border border-white shadow-[0_0_10px_rgba(0,255,255,0.5)] z-30">
                          #{user.id}
                        </div>
                        
                        <div className={`relative w-16 h-16 rounded-full p-[2px] transition-all duration-300 ${
                          isHoldingBomb 
                            ? "bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.8)] scale-125 z-20" 
                            : "bg-gradient-to-br from-purple-500 to-cyan-400"
                        }`}>
                          <div className="w-full h-full rounded-full bg-[#1a1f3a] overflow-hidden flex items-center justify-center">
                            {user.avatarUrl ? (
                              <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xl font-bold text-white uppercase">{user.username.slice(0, 2)}</span>
                            )}
                          </div>
                          {isHoldingBomb && (
                            <div className="absolute -top-4 -right-4 text-red-500 animate-bounce">
                              <Bomb size={24} fill="currentColor" />
                            </div>
                          )}
                        </div>
                      </div>
                      <span className={`text-xs font-medium truncate max-w-[80px] px-1 py-0.5 rounded ${
                        isHoldingBomb ? "bg-red-500 text-white" : "text-white/80"
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
