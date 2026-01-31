import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Trophy, Skull, Target, Users, Send } from "lucide-react";
import { io, Socket } from "socket.io-client";
import { useToast } from "@/hooks/use-toast";

// ربط اللعبة بالسيرفر للتفاعل المباشر
const socket = io(window.location.origin, { path: "/socket.io" });

interface Player {
  id: string;
  username: string;
  avatarUrl?: string;
}

interface GameState {
  status: 'waiting' | 'countdown' | 'ready' | 'finished';
  player1: Player | null;
  player2: Player | null;
  targetNumber: number | null;
  winner: Player | null;
  loser: Player | null;
  countdown: number;
}

interface ChatMessage {
  username: string;
  message: string;
  timestamp: number;
}

export default function GunDuelGame() {
  const { toast } = useToast();
  const [gameState, setGameState] = useState<GameState>({
    status: 'waiting',
    player1: null,
    player2: null,
    targetNumber: null,
    winner: null,
    loser: null,
    countdown: 10
  });

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [waitingPlayers, setWaitingPlayers] = useState<string[]>([]);
  const [numberInput, setNumberInput] = useState("");
  const [currentUser, setCurrentUser] = useState<Player | null>(null);
  const [shootEffect, setShootEffect] = useState<'left' | 'right' | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const numberInputRef = useRef<HTMLInputElement>(null);

  // تمرير الشات للأسفل تلقائياً
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // التركيز على حقل الرقم عندما تبدأ اللعبة
  useEffect(() => {
    if (gameState.status === 'ready' && numberInputRef.current) {
      numberInputRef.current.focus();
    }
  }, [gameState.status]);

  // Socket Events
  useEffect(() => {
    // استقبال معلومات المستخدم الحالي
    socket.on("current-user", (user: Player) => {
      setCurrentUser(user);
    });

    // تحديث قائمة المنتظرين
    socket.on("waiting-players-update", (players: string[]) => {
      setWaitingPlayers(players);
    });

    // بداية اللعبة
    socket.on("game-started", (data: { player1: Player; player2: Player }) => {
      setGameState({
        status: 'countdown',
        player1: data.player1,
        player2: data.player2,
        targetNumber: null,
        winner: null,
        loser: null,
        countdown: 10
      });

      toast({
        title: "🎮 بدأت المبارزة!",
        description: `${data.player1.username} ضد ${data.player2.username}`,
        duration: 3000
      });
    });

    // العد التنازلي
    socket.on("countdown-tick", (seconds: number) => {
      setGameState(prev => ({ ...prev, countdown: seconds }));
    });

    // ظهور الرقم المستهدف
    socket.on("number-revealed", (number: number) => {
      setGameState(prev => ({
        ...prev,
        status: 'ready',
        targetNumber: number,
        countdown: 0
      }));

      toast({
        title: "🎯 اكتب الرقم بسرعة!",
        description: `الرقم: ${number}`,
        duration: 2000
      });
    });

    // نهاية اللعبة
    socket.on("game-finished", (data: { winner: Player; loser: Player; shootDirection: 'left' | 'right' }) => {
      setGameState(prev => ({
        ...prev,
        status: 'finished',
        winner: data.winner,
        loser: data.loser
      }));

      setShootEffect(data.shootDirection);

      setTimeout(() => {
        setShootEffect(null);
      }, 2000);

      toast({
        title: "🏆 انتهت المبارزة!",
        description: `${data.winner.username} فاز بالمبارزة!`,
        duration: 5000
      });

      // إعادة تعيين اللعبة بعد 7 ثواني
      setTimeout(() => {
        setGameState({
          status: 'waiting',
          player1: null,
          player2: null,
          targetNumber: null,
          winner: null,
          loser: null,
          countdown: 10
        });
      }, 7000);
    });

    // رسائل الشات
    socket.on("chat-message", (message: ChatMessage) => {
      setChatMessages(prev => [...prev, message]);
    });

    // تنظيف
    return () => {
      socket.off("current-user");
      socket.off("waiting-players-update");
      socket.off("game-started");
      socket.off("countdown-tick");
      socket.off("number-revealed");
      socket.off("game-finished");
      socket.off("chat-message");
    };
  }, [toast]);

  // إرسال رسالة للشات
  const sendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    socket.emit("send-chat-message", chatInput.trim());
    setChatInput("");
  };

  // الانضمام للعبة
  const joinGame = () => {
    socket.emit("join-duel");
    toast({
      title: "✅ تم الانضمام للانتظار",
      description: "في انتظار لاعب آخر...",
      duration: 2000
    });
  };

  // إرسال الرقم
  const submitNumber = (e: React.FormEvent) => {
    e.preventDefault();
    if (!numberInput.trim() || gameState.status !== 'ready') return;

    socket.emit("submit-number", parseInt(numberInput));
    setNumberInput("");
  };

  // التحقق من كون المستخدم الحالي أحد اللاعبين
  const isCurrentPlayerInGame = currentUser && (
    gameState.player1?.id === currentUser.id || 
    gameState.player2?.id === currentUser.id
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-red-900 p-4 flex items-center justify-center">
      <div className="w-full max-w-7xl grid md:grid-cols-[1fr,400px] gap-6">

        {/* منطقة اللعبة الرئيسية */}
        <div className="bg-black/60 rounded-3xl border border-white/10 backdrop-blur-xl shadow-2xl p-8">

          {/* العنوان */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <Target className="text-red-500 fill-red-500 animate-pulse" size={40} />
            <h2 className="text-4xl font-black uppercase tracking-tighter italic text-white">
              مبارزة المسدسات
            </h2>
            <Target className="text-red-500 fill-red-500 animate-pulse" size={40} />
          </div>

          {/* منطقة اللعب */}
          <div className="relative min-h-[500px] flex items-center justify-center">

            {/* حالة الانتظار */}
            {gameState.status === 'waiting' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center"
              >
                <div className="mb-8">
                  <Users size={100} className="text-white/20 mx-auto mb-4" />
                  <h3 className="text-3xl font-bold text-white mb-2">
                    في انتظار اللاعبين
                  </h3>
                  <p className="text-gray-400 mb-6">
                    {waitingPlayers.length} لاعب في الانتظار
                  </p>
                </div>

                <Button
                  onClick={joinGame}
                  className="bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white text-xl font-black px-12 py-6 rounded-2xl shadow-xl transform hover:scale-105 transition-all"
                >
                  🎯 انضم للمبارزة
                </Button>

                {waitingPlayers.length > 0 && (
                  <div className="mt-6 text-sm text-gray-500">
                    المنتظرون: {waitingPlayers.join(", ")}
                  </div>
                )}
              </motion.div>
            )}

            {/* العد التنازلي */}
            {gameState.status === 'countdown' && gameState.player1 && gameState.player2 && (
              <div className="w-full">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center mb-12"
                >
                  <h3 className="text-2xl font-bold text-yellow-400 mb-4">
                    🎮 استعد للمبارزة!
                  </h3>
                  <div className="text-8xl font-black text-white mb-2">
                    {gameState.countdown}
                  </div>
                  <p className="text-gray-400">سيظهر الرقم قريباً...</p>
                </motion.div>

                {/* اللاعبان في وضع الاستعداد */}
                <div className="grid grid-cols-2 gap-8">
                  {/* اللاعب الأول - اليمين */}
                  <motion.div
                    initial={{ x: -100, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className="text-center"
                  >
                    <div className="relative inline-block mb-4">
                      <div className="w-32 h-32 rounded-full border-4 border-blue-500 overflow-hidden bg-gradient-to-br from-blue-600 to-blue-800 shadow-lg">
                        {gameState.player1.avatarUrl ? (
                          <img src={gameState.player1.avatarUrl} alt={gameState.player1.username} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-5xl font-black text-white">
                            {gameState.player1.username[0].toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="absolute -bottom-2 -right-2 text-6xl transform rotate-[-20deg]">
                        🔫
                      </div>
                    </div>
                    <h4 className="text-xl font-bold text-white">{gameState.player1.username}</h4>
                    <p className="text-sm text-gray-400">اللاعب الأول</p>
                  </motion.div>

                  {/* اللاعب الثاني - اليسار */}
                  <motion.div
                    initial={{ x: 100, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className="text-center"
                  >
                    <div className="relative inline-block mb-4">
                      <div className="w-32 h-32 rounded-full border-4 border-red-500 overflow-hidden bg-gradient-to-br from-red-600 to-red-800 shadow-lg">
                        {gameState.player2.avatarUrl ? (
                          <img src={gameState.player2.avatarUrl} alt={gameState.player2.username} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-5xl font-black text-white">
                            {gameState.player2.username[0].toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="absolute -bottom-2 -left-2 text-6xl transform rotate-[20deg] scale-x-[-1]">
                        🔫
                      </div>
                    </div>
                    <h4 className="text-xl font-bold text-white">{gameState.player2.username}</h4>
                    <p className="text-sm text-gray-400">اللاعب الثاني</p>
                  </motion.div>
                </div>
              </div>
            )}

            {/* حالة جاهز - ظهور الرقم */}
            {gameState.status === 'ready' && gameState.player1 && gameState.player2 && (
              <div className="w-full">
                {/* الرقم المستهدف */}
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", duration: 0.5 }}
                  className="text-center mb-12"
                >
                  <div className="inline-block relative">
                    <div className="absolute inset-0 bg-yellow-500 blur-3xl opacity-50 rounded-full"></div>
                    <div className="relative w-48 h-48 rounded-full border-8 border-yellow-500 bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-2xl">
                      <span className="text-9xl font-black text-white drop-shadow-lg">
                        {gameState.targetNumber}
                      </span>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-yellow-400 mt-6 animate-pulse">
                    ⚡ اكتب الرقم بسرعة!
                  </p>
                </motion.div>

                {/* اللاعبان */}
                <div className="grid grid-cols-2 gap-8">
                  {/* اللاعب الأول */}
                  <motion.div
                    animate={{ 
                      x: shootEffect === 'right' ? 50 : 0,
                      scale: shootEffect === 'left' ? 0.8 : 1
                    }}
                    className="text-center"
                  >
                    <div className="relative inline-block mb-4">
                      <div className={`w-32 h-32 rounded-full border-4 ${
                        gameState.loser?.id === gameState.player1.id 
                          ? 'border-gray-500 opacity-50' 
                          : 'border-blue-500'
                      } overflow-hidden bg-gradient-to-br from-blue-600 to-blue-800 shadow-lg`}>
                        {gameState.player1.avatarUrl ? (
                          <img src={gameState.player1.avatarUrl} alt={gameState.player1.username} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-5xl font-black text-white">
                            {gameState.player1.username[0].toUpperCase()}
                          </div>
                        )}
                        {gameState.loser?.id === gameState.player1.id && (
                          <div className="absolute inset-0 flex items-center justify-center bg-red-600/80">
                            <Skull size={60} className="text-white animate-pulse" />
                          </div>
                        )}
                      </div>
                      <div className="absolute -bottom-2 -right-2 text-6xl transform rotate-[-20deg]">
                        🔫
                      </div>
                      {shootEffect === 'right' && (
                        <motion.div
                          initial={{ x: 0, opacity: 1 }}
                          animate={{ x: 200, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="absolute top-1/2 right-0 text-4xl"
                        >
                          💥
                        </motion.div>
                      )}
                    </div>
                    <h4 className="text-xl font-bold text-white">{gameState.player1.username}</h4>
                  </motion.div>

                  {/* اللاعب الثاني */}
                  <motion.div
                    animate={{ 
                      x: shootEffect === 'left' ? -50 : 0,
                      scale: shootEffect === 'right' ? 0.8 : 1
                    }}
                    className="text-center"
                  >
                    <div className="relative inline-block mb-4">
                      <div className={`w-32 h-32 rounded-full border-4 ${
                        gameState.loser?.id === gameState.player2.id 
                          ? 'border-gray-500 opacity-50' 
                          : 'border-red-500'
                      } overflow-hidden bg-gradient-to-br from-red-600 to-red-800 shadow-lg`}>
                        {gameState.player2.avatarUrl ? (
                          <img src={gameState.player2.avatarUrl} alt={gameState.player2.username} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-5xl font-black text-white">
                            {gameState.player2.username[0].toUpperCase()}
                          </div>
                        )}
                        {gameState.loser?.id === gameState.player2.id && (
                          <div className="absolute inset-0 flex items-center justify-center bg-red-600/80">
                            <Skull size={60} className="text-white animate-pulse" />
                          </div>
                        )}
                      </div>
                      <div className="absolute -bottom-2 -left-2 text-6xl transform rotate-[20deg] scale-x-[-1]">
                        🔫
                      </div>
                      {shootEffect === 'left' && (
                        <motion.div
                          initial={{ x: 0, opacity: 1 }}
                          animate={{ x: -200, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="absolute top-1/2 left-0 text-4xl"
                        >
                          💥
                        </motion.div>
                      )}
                    </div>
                    <h4 className="text-xl font-bold text-white">{gameState.player2.username}</h4>
                  </motion.div>
                </div>

                {/* حقل إدخال الرقم - فقط للاعبين في اللعبة */}
                {isCurrentPlayerInGame && (
                  <motion.form
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    onSubmit={submitNumber}
                    className="mt-12 max-w-md mx-auto"
                  >
                    <div className="flex gap-3">
                      <Input
                        ref={numberInputRef}
                        type="number"
                        value={numberInput}
                        onChange={(e) => setNumberInput(e.target.value)}
                        placeholder="اكتب الرقم هنا..."
                        className="flex-1 bg-white/10 border-white/20 text-white text-2xl font-bold text-center h-16 rounded-xl"
                        autoFocus
                      />
                      <Button
                        type="submit"
                        className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 h-16 px-8 rounded-xl font-black text-lg"
                      >
                        🎯 إطلاق!
                      </Button>
                    </div>
                  </motion.form>
                )}
              </div>
            )}

            {/* شاشة الفوز */}
            {gameState.status === 'finished' && gameState.winner && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center"
              >
                <div className="mb-8">
                  <Trophy size={120} className="text-yellow-400 mx-auto mb-4 animate-bounce" />
                  <h3 className="text-5xl font-black text-yellow-400 mb-4">
                    🏆 الفائز!
                  </h3>
                  <div className="w-40 h-40 rounded-full border-8 border-yellow-500 overflow-hidden bg-gradient-to-br from-yellow-400 to-orange-500 shadow-2xl mx-auto mb-4">
                    {gameState.winner.avatarUrl ? (
                      <img src={gameState.winner.avatarUrl} alt={gameState.winner.username} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-7xl font-black text-white">
                        {gameState.winner.username[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                  <h4 className="text-4xl font-bold text-white mb-2">
                    {gameState.winner.username}
                  </h4>
                  <p className="text-xl text-gray-400">
                    كان الأسرع في كتابة الرقم!
                  </p>
                </div>

                <div className="text-sm text-gray-500 animate-pulse">
                  جارٍ بدء جولة جديدة...
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* منطقة الشات */}
        <div className="bg-black/60 rounded-3xl border border-white/10 backdrop-blur-xl shadow-2xl p-6 flex flex-col h-[700px]">
          <div className="flex items-center gap-2 mb-4 pb-4 border-b border-white/10">
            <Zap className="text-yellow-400 fill-yellow-400" />
            <h3 className="text-xl font-black text-white uppercase">الشات المباشر</h3>
          </div>

          {/* رسائل الشات */}
          <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-2">
            <AnimatePresence>
              {chatMessages.map((msg, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white/5 rounded-xl p-3 border border-white/10"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-cyan-400 text-sm">
                      {msg.username}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(msg.timestamp).toLocaleTimeString('ar-SA', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </span>
                  </div>
                  <p className="text-white text-sm">{msg.message}</p>
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={chatEndRef} />
          </div>

          {/* حقل إرسال الرسائل */}
          <form onSubmit={sendChatMessage} className="flex gap-2">
            <Input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="اكتب رسالة..."
              className="flex-1 bg-white/10 border-white/20 text-white rounded-xl"
            />
            <Button
              type="submit"
              className="bg-cyan-600 hover:bg-cyan-700 rounded-xl px-6"
            >
              <Send size={18} />
            </Button>
          </form>

          {/* تعليمات */}
          <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
            <p className="text-xs text-yellow-400 font-medium text-center">
              💡 اكتب "دخول" في الشات للانضمام للعبة!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}