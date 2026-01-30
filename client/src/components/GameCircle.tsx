import { useUsers, useGameCircle } from "@/hooks/use-users";
import { Bomb, User as UserIcon, Trophy, Skull } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { queryClient } from "@/lib/queryClient";
import { api } from "@shared/routes";
import { type User } from "@shared/schema";

// روابط الأصوات
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
  const [winner, setWinner] = useState<User | null>(null);
  const [explodingId, setExplodingId] = useState<number | null>(null);

  // دالة تشغيل الأصوات
  const playSound = (type: keyof typeof SOUNDS) => {
    const audio = new Audio(SOUNDS[type]);
    audio.volume = 0.6;
    audio.play().catch(e => console.log("Audio play failed", e));
  };

  useEffect(() => {
    const socket = io(window.location.origin, { path: "/socket.io" });

    socket.on("connect", () => {
      console.log("✅ Connected to WebSocket");
    });

    // 1. استقبال القنبلة
    socket.on("bomb_started", ({ playerId }) => {
      console.log(`💣 Bomb passed to: ${playerId}`);
      if (bombPlayerId !== playerId) {
        playSound("pass");
        setBombPlayerId(playerId);
        setWinner(null); // إخفاء شاشة الفوز عند بدء جولة جديدة
      }
    });

    // 2. عند انفجار القنبلة (الإقصاء)
    socket.on("player_eliminated", ({ playerId }) => {
      console.log(`💥 Eliminated: ${playerId}`);
      playSound("explosion");
      setExplodingId(playerId); // تفعيل تأثير الانفجار

      // إخفاء القنبلة مؤقتاً
      if (bombPlayerId === playerId) {
        setBombPlayerId(null);
      }

      // بعد ثانية واحدة، قم بتحديث القائمة لإخفاء اللاعب
      setTimeout(() => {
        setExplodingId(null);
        // 🔥 هذا السطر هو الأهم: يجبر الصفحة على تحديث القائمة فوراً
        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      }, 1000);
    });

    // 3. عند الفوز
    socket.on("game_winner", (winnerUser: User) => {
      console.log(`🏆 Winner: ${winnerUser.username}`);
      playSound("victory");
      setWinner(winnerUser);
      setBombPlayerId(null);
      // تحديث القائمة للتأكد من حالة الجميع
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    });

    // 4. إعادة تعيين اللعبة
    socket.on("game_reset", () => {
      setWinner(null);
      setBombPlayerId(null);
      setExplodingId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    });

    // 5. لاعب جديد انضم
    socket.on("new_player", () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    });

    return () => {
      socket.disconnect();
    };
  }, [bombPlayerId]);

  // حساب نصف القطر بناءً على عدد اللاعبين
  const getRadius = () => {
    const count = users?.filter(u => u.lobbyStatus === "active").length || 0;
    if (count <= 5) return 140;
    if (count <= 10) return 180;
    if (count <= 15) return 220;
    return 260; // دائرة كبيرة جداً للأعداد الكبيرة
  };

  const activePlayers = users?.filter(u => u.lobbyStatus === "active") || [];
  const radius = getRadius();

  // === شاشة الفوز ===
  if (winner) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] animate-in zoom-in duration-500">
        <Trophy size={120} className="text-yellow-400 mb-6 drop-shadow-[0_0_30px_rgba(250,204,21,0.6)] animate-bounce" />
        <h2 className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-orange-400 to-yellow-300 mb-4 text-center">
          {winner.username}
        </h2>
        <p className="text-2xl text-white/80 font-bold">👑 بطل الساحة 👑</p>
      </div>
    );
  }

  // === ساحة اللعب ===
  return (
    <div className="relative w-full h-full flex items-center justify-center py-20 overflow-hidden">
      {/* دائرة الخلفية */}
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
          const angle = (index / total) * 2 * Math.PI - Math.PI / 2; // -90deg start
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;

          const isHoldingBomb = bombPlayerId === user.id;
          const isExploding = explodingId === user.id;

          return (
            <div
              key={user.id}
              className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-500
                ${isExploding ? "scale-150 z-50" : "hover:scale-110 z-10"}
              `}
              style={{ 
                transform: `translate(${x}px, ${y}px) translate(-50%, -50%)`,
              }}
            >
              <div className="flex flex-col items-center gap-2 relative">

                {/* دائرة الصورة */}
                <div className={`relative w-16 h-16 md:w-20 md:h-20 rounded-full border-4 shadow-2xl overflow-visible transition-all duration-300
                  ${isHoldingBomb ? "border-red-500 shadow-[0_0_40px_rgba(239,68,68,0.6)] animate-pulse" : "border-white/20"}
                `}>
                   {/* رقم اللاعب الكبير جداً والواضح */}
                   <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-50">
                      <span className="bg-cyan-400 text-black font-black text-xl px-3 py-1 rounded-full shadow-[0_0_15px_rgba(34,211,238,0.8)] border-2 border-white">
                        #{user.id}
                      </span>
                   </div>

                  <div className="w-full h-full rounded-full overflow-hidden bg-black/50">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-800 text-white">
                         <span className="font-bold text-2xl">{user.username.charAt(0)}</span>
                      </div>
                    )}
                  </div>

                  {/* أيقونة القنبلة فوق الصورة */}
                  {isHoldingBomb && (
                    <div className="absolute -top-8 -right-8 z-50 animate-bounce">
                      <Bomb size={48} className="text-red-500 fill-red-600 drop-shadow-2xl" />
                    </div>
                  )}

                  {/* تأثير الانفجار */}
                  {isExploding && (
                    <div className="absolute inset-0 -m-8 flex items-center justify-center z-50 pointer-events-none">
                       <Skull size={80} className="text-white animate-ping absolute" />
                       <div className="w-32 h-32 bg-orange-500 rounded-full animate-ping opacity-75"></div>
                    </div>
                  )}
                </div>

                {/* اسم اللاعب */}
                <div className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-lg border border-white/10 max-w-[120px]">
                  <p className="text-white font-bold text-sm truncate text-center dir-rtl">
                    {user.username}
                  </p>
                </div>

              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
