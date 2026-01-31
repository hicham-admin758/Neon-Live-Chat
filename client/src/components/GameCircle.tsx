import { useUsers } from "@/hooks/use-users";
import { Bomb, Trophy, Skull, Play, RotateCcw, Users, Zap, Flame, AlertTriangle } from "lucide-react";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { type User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

// 🎵 مكتبة أصوات محسنة ومتنوعة
const SOUNDS = {
  tick: "https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3",
  explosion: "https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3",
  pass: "https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.mp3",
  victory: "https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3",
  warning: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3",
  countdown: "https://assets.mixkit.co/active_storage/sfx/2570/2570-preview.mp3",
  tension: "https://assets.mixkit.co/active_storage/sfx/2573/2573-preview.mp3"
};

// 🎮 نظام ذكي لإدارة الأصوات مع تخزين مؤقت
class SoundManager {
  private audioCache: Map<string, HTMLAudioElement> = new Map();
  private isMuted: boolean = false;

  constructor() {
    // تحميل الأصوات مسبقاً للحد من التأخير
    Object.entries(SOUNDS).forEach(([key, url]) => {
      const audio = new Audio(url);
      audio.preload = "auto";
      audio.volume = 0.5;
      this.audioCache.set(key, audio);
    });
  }

  play(type: keyof typeof SOUNDS, volume: number = 0.5) {
    if (this.isMuted) return;

    try {
      const audio = this.audioCache.get(type);
      if (audio) {
        // إنشاء نسخة جديدة للسماح بتشغيل متعدد
        const clone = audio.cloneNode() as HTMLAudioElement;
        clone.volume = volume;
        clone.play().catch(() => {});
      }
    } catch (e) {
      console.warn("Sound play failed:", e);
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }
}

// 🎯 حساب موضع اللاعبين بشكل ذكي
const calculatePlayerPosition = (
  index: number, 
  total: number, 
  radius: number,
  offset: number = -Math.PI / 2
) => {
  const angle = (index / total) * 2 * Math.PI + offset;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    angle: (angle * 180) / Math.PI
  };
};

// 🔧 تحديد حجم الدائرة الديناميكي بناءً على عدد اللاعبين
const getOptimalRadius = (playerCount: number, screenWidth: number): number => {
  if (playerCount <= 4) return Math.min(screenWidth * 0.25, 160);
  if (playerCount <= 8) return Math.min(screenWidth * 0.3, 220);
  if (playerCount <= 12) return Math.min(screenWidth * 0.35, 280);
  if (playerCount <= 20) return Math.min(screenWidth * 0.4, 350);
  return Math.min(screenWidth * 0.45, 420);
};

export function GameCircle() {
  const { data: users, isLoading } = useUsers();
  const { toast } = useToast();

  // 🎮 حالات اللعبة
  const [bombPlayerId, setBombPlayerId] = useState<number | null>(null);
  const [winner, setWinner] = useState<User | null>(null);
  const [explodingId, setExplodingId] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(30);
  const [isGameActive, setIsGameActive] = useState<boolean>(false);
  const [eliminatedPlayers, setEliminatedPlayers] = useState<Set<number>>(new Set());
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [isMuted, setIsMuted] = useState(false);
  const [passAnimation, setPassAnimation] = useState<{from: number; to: number} | null>(null);

  // 🔊 مدير الأصوات
  const soundManager = useRef(new SoundManager());
  const socketRef = useRef<Socket | null>(null);
  const winnerTimeoutRef = useRef<NodeJS.Timeout>();
  const explosionTimeoutRef = useRef<NodeJS.Timeout>();

  // 📐 حساب نصف القطر الأمثل
  const activePlayers = useMemo(() => 
    users?.filter(u => u.lobbyStatus === "active" && !eliminatedPlayers.has(u.id)) || [], 
    [users, eliminatedPlayers]
  );

  const radius = useMemo(() => 
    getOptimalRadius(activePlayers.length, screenWidth),
    [activePlayers.length, screenWidth]
  );

  // 🔊 تشغيل الصوت
  const playSound = useCallback((type: keyof typeof SOUNDS, volume?: number) => {
    soundManager.current.play(type, volume);
  }, []);

  // 🔇 تبديل كتم الصوت
  const toggleMute = useCallback(() => {
    const muted = soundManager.current.toggleMute();
    setIsMuted(muted);
    toast({
      title: muted ? "تم كتم الصوت 🔇" : "تم تشغيل الصوت 🔊",
      duration: 1500
    });
  }, [toast]);

  // 📱 تحديث حجم الشاشة
  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 🌐 إدارة Socket.IO بشكل محسّن
  useEffect(() => {
    const socket = io(window.location.origin, { 
      path: "/socket.io",
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000
    });

    socketRef.current = socket;

    // 🎯 بداية اللعبة
    socket.on("bomb_started", ({ playerId, seconds }) => {
      setIsGameActive(true);
      setWinner(null);
      setBombPlayerId(playerId);
      setEliminatedPlayers(new Set());
      if (seconds) setTimeLeft(seconds);
      playSound("pass");

      toast({
        title: "🎮 اللعبة بدأت!",
        description: `القنبلة مع اللاعب #${playerId}`,
        duration: 2000
      });
    });

    // ⏱️ دقات العداد
    socket.on("bomb_tick", ({ seconds }) => {
      setTimeLeft(seconds);

      // أصوات محسنة بناءً على الوقت المتبقي
      if (seconds === 10) {
        playSound("warning", 0.6);
      } else if (seconds <= 5) {
        playSound("tick", 0.7);
      } else if (seconds <= 10 && seconds % 2 === 0) {
        playSound("countdown", 0.4);
      }
    });

    // 🔄 تمرير القنبلة
    socket.on("bomb_passed", ({ fromId, toId }: { fromId: number; toId: number }) => {
      setPassAnimation({ from: fromId, to: toId });
      playSound("pass", 0.5);

      setTimeout(() => {
        setBombPlayerId(toId);
        setPassAnimation(null);
      }, 300);
    });

    // 💥 إقصاء لاعب
    socket.on("player_eliminated", ({ playerId }) => {
      playSound("explosion", 0.8);
      setExplodingId(playerId);
      setEliminatedPlayers(prev => new Set([...prev, playerId]));

      // مسح الانيميشن بعد 1.5 ثانية
      if (explosionTimeoutRef.current) {
        clearTimeout(explosionTimeoutRef.current);
      }

      explosionTimeoutRef.current = setTimeout(() => {
        setExplodingId(null);
        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      }, 1500);

      toast({
        title: "💥 تم إقصاء لاعب!",
        description: `اللاعب #${playerId} خرج من اللعبة`,
        variant: "destructive",
        duration: 2000
      });
    });

    // 🏆 الفائز
    socket.on("game_winner", (winnerUser: User) => {
      playSound("victory", 0.9);
      setWinner(winnerUser);
      setBombPlayerId(null);
      setIsGameActive(false);

      toast({
        title: "🏆 لدينا فائز!",
        description: `تهانينا ${winnerUser.username}!`,
        duration: 3000
      });

      // مسح الفائز بعد 7 ثوان
      if (winnerTimeoutRef.current) {
        clearTimeout(winnerTimeoutRef.current);
      }

      winnerTimeoutRef.current = setTimeout(() => {
        setWinner(null);
        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      }, 7000);
    });

    // 🔄 إعادة تعيين اللعبة
    socket.on("game_reset", () => {
      setWinner(null);
      setBombPlayerId(null);
      setTimeLeft(30);
      setIsGameActive(false);
      setEliminatedPlayers(new Set());
      setPassAnimation(null);

      if (winnerTimeoutRef.current) clearTimeout(winnerTimeoutRef.current);
      if (explosionTimeoutRef.current) clearTimeout(explosionTimeoutRef.current);

      queryClient.invalidateQueries({ queryKey: ["/api/users"] });

      toast({
        title: "🔄 تمت إعادة تعيين اللعبة",
        duration: 2000
      });
    });

    // ⚠️ معالجة الأخطاء
    socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
      toast({
        title: "⚠️ خطأ في الاتصال",
        description: "جاري إعادة الاتصال...",
        variant: "destructive",
        duration: 3000
      });
    });

    socket.on("reconnect", (attemptNumber) => {
      toast({
        title: "✅ تم إعادة الاتصال",
        description: `بعد ${attemptNumber} محاولة`,
        duration: 2000
      });
    });

    // 🧹 التنظيف عند إلغاء التركيب
    return () => {
      socket.disconnect();
      if (winnerTimeoutRef.current) clearTimeout(winnerTimeoutRef.current);
      if (explosionTimeoutRef.current) clearTimeout(explosionTimeoutRef.current);
    };
  }, [playSound, toast]);

  // ⏳ شاشة التحميل
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="w-20 h-20 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-white text-xl font-bold animate-pulse">جاري التحميل...</p>
      </div>
    );
  }

  // 🏆 شاشة الفائز المحسنة
  if (winner) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen relative overflow-hidden">
        {/* خلفية متحركة */}
        <div className="absolute inset-0 bg-gradient-to-br from-yellow-900/20 via-orange-900/20 to-red-900/20"></div>

        {/* تأثيرات الضوء */}
        <div className="absolute inset-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-yellow-500/30 blur-[150px] rounded-full animate-pulse"></div>
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-orange-500/20 blur-[100px] rounded-full animate-pulse delay-75"></div>
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-red-500/20 blur-[100px] rounded-full animate-pulse delay-150"></div>
        </div>

        <div className="relative z-10 flex flex-col items-center animate-in zoom-in duration-700">
          {/* أيقونة الكأس المتحركة */}
          <div className="relative mb-8">
            <Trophy size={160} className="text-yellow-400 drop-shadow-2xl animate-bounce" />
            <div className="absolute -top-4 -right-4">
              <Zap size={50} className="text-yellow-300 animate-pulse" />
            </div>
            <div className="absolute -bottom-4 -left-4">
              <Flame size={50} className="text-orange-400 animate-pulse delay-75" />
            </div>
          </div>

          {/* صورة الفائز */}
          <div className="relative w-72 h-72 rounded-full border-8 border-yellow-500 shadow-2xl overflow-hidden mb-6 animate-in zoom-in delay-150">
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/20 to-orange-600/20"></div>
            {winner.avatarUrl ? (
              <img src={winner.avatarUrl} className="w-full h-full object-cover" alt={winner.username} />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-yellow-600 to-orange-600 flex items-center justify-center text-9xl font-black text-white">
                {winner.username[0].toUpperCase()}
              </div>
            )}
          </div>

          {/* اسم الفائز */}
          <h1 className="text-7xl font-black text-yellow-400 mb-4 animate-in slide-in-from-bottom delay-300 text-center drop-shadow-lg">
            {winner.username}
          </h1>

          {/* شارة الفائز */}
          <div className="px-8 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full shadow-xl animate-in slide-in-from-bottom delay-500">
            <p className="text-2xl text-white font-black tracking-wide">
              🏆 الفائز الأخير 🏆
            </p>
          </div>

          {/* نجوم متحركة */}
          <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 bg-yellow-300 rounded-full animate-ping"
                style={{
                  top: `${Math.random() * 100}%`,
                  left: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 2}s`,
                  animationDuration: `${2 + Math.random() * 2}s`
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 🎮 الشاشة الرئيسية للعبة
  return (
    <div className="w-full flex flex-col items-center relative min-h-screen justify-center overflow-hidden bg-gradient-to-br from-gray-900 via-black to-gray-900">

      {/* 🎨 خلفية متحركة */}
      <div className="absolute inset-0 overflow-hidden opacity-20">
        <div className="absolute w-96 h-96 bg-cyan-500 rounded-full blur-[150px] -top-48 -left-48 animate-pulse"></div>
        <div className="absolute w-96 h-96 bg-blue-500 rounded-full blur-[150px] -bottom-48 -right-48 animate-pulse delay-75"></div>
      </div>

      {/* 🎛️ أزرار التحكم المحسنة */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 flex gap-3 z-[100] bg-black/70 backdrop-blur-xl p-3 rounded-2xl border border-white/20 shadow-2xl">
        <Button 
          onClick={() => apiRequest("POST", "/api/game/start-bomb")} 
          className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 font-bold shadow-lg transition-all hover:scale-105"
          disabled={isGameActive}
        >
          <Play size={18} className="ml-2" /> ابدأ
        </Button>

        <Button 
          onClick={() => apiRequest("POST", "/api/game/reset")} 
          className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 font-bold shadow-lg transition-all hover:scale-105"
        >
          <RotateCcw size={18} className="ml-2" /> إعادة
        </Button>

        <Button 
          onClick={toggleMute}
          variant="outline"
          className="font-bold border-white/30 hover:bg-white/10 transition-all"
        >
          {isMuted ? "🔇" : "🔊"}
        </Button>

        <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-xl border border-white/20">
          <Users size={18} className="text-cyan-400" />
          <span className="font-bold text-white">{activePlayers.length}</span>
        </div>
      </div>

      {/* 🎯 منطقة اللعب */}
      <div className="relative flex items-center justify-center w-full h-[700px] md:h-[800px]">

        {/* ✨ الدوائر الزخرفية المحسنة */}
        <div 
          className="absolute rounded-full border-[3px] border-dashed border-cyan-500/30 animate-[spin_120s_linear_infinite]"
          style={{ width: radius * 2, height: radius * 2 }}
        />
        <div 
          className="absolute rounded-full border-2 border-blue-500/20 animate-[spin_100s_linear_infinite_reverse]"
          style={{ width: (radius * 2) + 40, height: (radius * 2) + 40 }}
        />
        <div 
          className="absolute rounded-full border border-purple-500/10 animate-pulse"
          style={{ width: (radius * 2) + 80, height: (radius * 2) + 80 }}
        />

        {/* ⏲️ العداد المركزي المحسن */}
        <div className="absolute z-10 flex flex-col items-center justify-center">
          {bombPlayerId ? (
            <div className="relative">
              {/* تأثير التوهج */}
              {timeLeft <= 5 && (
                <div className="absolute inset-0 bg-red-500 rounded-full blur-2xl opacity-60 animate-pulse"></div>
              )}

              <div className={`
                relative w-40 h-40 md:w-48 md:h-48 rounded-full flex items-center justify-center 
                border-[6px] shadow-2xl transition-all duration-300
                ${timeLeft <= 5 
                  ? 'border-red-600 bg-gradient-to-br from-red-600/30 to-orange-600/30 scale-110 shadow-red-600/60 animate-pulse' 
                  : timeLeft <= 10
                  ? 'border-orange-500 bg-gradient-to-br from-orange-500/20 to-yellow-500/20 shadow-orange-500/40'
                  : 'border-cyan-500 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 shadow-cyan-500/30'
                }
              `}>
                {/* أيقونة تحذير للثواني الأخيرة */}
                {timeLeft <= 5 && (
                  <AlertTriangle 
                    size={40} 
                    className="absolute -top-12 text-red-500 animate-bounce" 
                  />
                )}

                <span className={`
                  text-8xl md:text-9xl font-black font-mono leading-none transition-colors duration-300
                  ${timeLeft <= 5 
                    ? 'text-red-500 animate-pulse' 
                    : timeLeft <= 10
                    ? 'text-orange-400'
                    : 'text-cyan-400'
                  }
                `}>
                  {timeLeft}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-32 h-32 border-4 border-white/20 border-t-cyan-500 rounded-full animate-spin"></div>
              <div className="text-white/40 font-bold text-xl uppercase tracking-widest animate-pulse">
                في انتظار البداية
              </div>
            </div>
          )}
        </div>

        {/* 👥 توزيع اللاعبين المحسن */}
        <div className="relative w-full h-full">
          {activePlayers.map((user, index) => {
            const { x, y } = calculatePlayerPosition(index, activePlayers.length, radius);
            const isHoldingBomb = bombPlayerId === user.id;
            const isEliminated = eliminatedPlayers.has(user.id);
            const isExploding = explodingId === user.id;

            return (
              <div
                key={user.id}
                className={`
                  absolute top-1/2 left-1/2 transition-all duration-500
                  ${isEliminated ? 'opacity-0 scale-0' : 'opacity-100 scale-100'}
                `}
                style={{ 
                  left: `calc(50% + ${x}px)`, 
                  top: `calc(50% + ${y}px)`, 
                  transform: 'translate(-50%, -50%)',
                  zIndex: isHoldingBomb ? 50 : isExploding ? 60 : 10
                }}
              >
                <div className="flex flex-col items-center gap-3 relative group">

                  {/* 🔢 رقم اللاعب المحسن */}
                  <div className={`
                    absolute -top-12 px-5 py-2 rounded-xl border-3 font-black text-xl shadow-2xl 
                    transition-all duration-300 backdrop-blur-sm
                    ${isHoldingBomb 
                      ? 'bg-gradient-to-r from-red-600 to-orange-600 border-red-300 text-white scale-125 animate-pulse' 
                      : 'bg-gradient-to-r from-cyan-900 to-blue-900 border-cyan-500 text-cyan-200 group-hover:scale-110'
                    }
                  `}>
                    #{user.id}
                  </div>

                  {/* 🖼️ صورة اللاعب المحسنة */}
                  <div className="relative">
                    {/* تأثير التوهج للاعب الممسك بالقنبلة */}
                    {isHoldingBomb && (
                      <div className="absolute inset-0 bg-red-500 rounded-full blur-xl opacity-60 scale-125 animate-pulse"></div>
                    )}

                    <div className={`
                      relative w-24 h-24 md:w-28 md:h-28 rounded-full border-4 transition-all duration-500
                      ${isHoldingBomb 
                        ? "border-red-500 scale-110 shadow-[0_0_50px_rgba(239,68,68,0.9)]" 
                        : "border-white/40 bg-gradient-to-br from-gray-800 to-gray-900 shadow-xl group-hover:border-cyan-400 group-hover:shadow-cyan-500/50 group-hover:scale-105"
                      }
                    `}>
                      <div className="w-full h-full rounded-full overflow-hidden">
                        {user.avatarUrl ? (
                          <img 
                            src={user.avatarUrl} 
                            className="w-full h-full object-cover" 
                            alt={user.username}
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white text-4xl font-bold bg-gradient-to-br from-gray-700 via-gray-800 to-black">
                            {user.username[0].toUpperCase()}
                          </div>
                        )}
                      </div>

                      {/* 💣 القنبلة المحسنة */}
                      {isHoldingBomb && !isExploding && (
                        <div className="absolute -bottom-3 -right-3 animate-bounce">
                          <div className="relative">
                            <div className="absolute inset-0 bg-red-500 blur-lg opacity-70 rounded-full"></div>
                            <Bomb size={50} className="relative text-red-500 fill-black drop-shadow-[0_0_15px_rgba(255,0,0,1)]" />
                          </div>
                        </div>
                      )}

                      {/* 💥 الانفجار المحسن */}
                      {isExploding && (
                        <>
                          {/* موجات الانفجار */}
                          <div className="absolute inset-0">
                            <div className="absolute inset-0 bg-orange-500 rounded-full animate-ping opacity-75"></div>
                            <div className="absolute inset-0 bg-red-600 rounded-full animate-ping delay-75 opacity-75"></div>
                            <div className="absolute inset-0 bg-yellow-500 rounded-full animate-ping delay-150 opacity-75"></div>
                          </div>

                          {/* أيقونة الجمجمة */}
                          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-orange-600 to-red-700 rounded-full z-[70] scale-150 animate-pulse">
                            <Skull size={70} className="text-white drop-shadow-2xl animate-bounce" />
                          </div>

                          {/* جزيئات الانفجار */}
                          <div className="absolute inset-0">
                            {[...Array(12)].map((_, i) => (
                              <div
                                key={i}
                                className="absolute w-3 h-3 bg-orange-400 rounded-full animate-ping"
                                style={{
                                  top: '50%',
                                  left: '50%',
                                  transform: `translate(-50%, -50%) rotate(${i * 30}deg) translateY(-${40 + i * 5}px)`,
                                  animationDelay: `${i * 0.05}s`
                                }}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 🏷️ اسم اللاعب المحسن */}
                  <div className={`
                    px-5 py-2 rounded-full text-sm font-black border-2 backdrop-blur-md shadow-lg
                    transition-all duration-300 max-w-[120px] truncate
                    ${isHoldingBomb 
                      ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white border-red-400 scale-110' 
                      : 'bg-black/80 text-gray-200 border-white/20 group-hover:border-cyan-400 group-hover:bg-cyan-950/50'
                    }
                  `}>
                    {user.username}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* خط تمرير القنبلة المتحرك */}
        {passAnimation && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 45 }}>
            <line
              x1="50%"
              y1="50%"
              x2="50%"
              y2="50%"
              stroke="red"
              strokeWidth="4"
              strokeDasharray="10,5"
              className="animate-pulse"
            />
          </svg>
        )}
      </div>

      {/* معلومات الحالة */}
      {isGameActive && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 bg-black/70 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl">
          <p className="text-white font-bold text-lg">
            {activePlayers.length} لاعب متبقي • {eliminatedPlayers.size} تم إقصاؤهم
          </p>
        </div>
      )}
    </div>
  );
}