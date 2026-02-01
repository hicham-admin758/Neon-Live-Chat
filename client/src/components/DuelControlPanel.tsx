// 🎮 مكون: زر بدء مبارزة المسدسات
// يمكن إضافته في لوحة التحكم أو في الواجهة الرئيسية

import { useState } from "react";
import { Target, Users, Sparkles } from "lucide-react";

interface StartDuelButtonProps {
  socket: any; // Socket instance
  waitingPlayersCount: number;
  isGameActive: boolean;
}

export function StartDuelButton({ socket, waitingPlayersCount, isGameActive }: StartDuelButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleStartDuel = () => {
    if (waitingPlayersCount < 2) {
      alert("يجب وجود لاعبين على الأقل في القائمة!\n(اكتب !دخول للانضمام)");
      return;
    }

    if (isGameActive) {
      alert("هناك لعبة جارية بالفعل!");
      return;
    }

    setIsLoading(true);

    // ✅ إرسال طلب بدء اللعبة
    socket?.emit('start_gun_duel');

    // إيقاف التحميل بعد ثانية
    setTimeout(() => setIsLoading(false), 1000);
  };

  return (
    <div className="flex flex-col gap-4 p-6 bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-cyan-500/20 shadow-2xl">

      {/* معلومات القائمة */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-8 h-8 text-cyan-400" />
          <div>
            <h3 className="text-white font-bold text-lg">اللاعبون النشطون</h3>
            <p className="text-cyan-400 text-sm">جاهزون للمبارزة</p>
          </div>
        </div>

        <div className="bg-cyan-500/10 px-4 py-2 rounded-xl border border-cyan-500/30">
          <span className="text-3xl font-black text-cyan-400">{waitingPlayersCount}</span>
        </div>
      </div>

      {/* الزر */}
      <button
        onClick={handleStartDuel}
        disabled={waitingPlayersCount < 2 || isGameActive || isLoading}
        className={`
          relative overflow-hidden
          px-8 py-4 rounded-xl
          font-black text-xl
          transition-all duration-300
          ${waitingPlayersCount >= 2 && !isGameActive && !isLoading
            ? 'bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white shadow-lg hover:shadow-red-500/50 hover:scale-105 cursor-pointer'
            : 'bg-gray-700 text-gray-400 cursor-not-allowed opacity-50'
          }
        `}
      >
        {/* تأثير توهج */}
        {waitingPlayersCount >= 2 && !isGameActive && !isLoading && (
          <div className="absolute inset-0 bg-gradient-to-r from-yellow-400/0 via-yellow-400/20 to-yellow-400/0 animate-shimmer" />
        )}

        {/* أيقونة ونص */}
        <div className="relative flex items-center justify-center gap-3">
          {isLoading ? (
            <>
              <div className="animate-spin">⚡</div>
              <span>جاري التحضير...</span>
            </>
          ) : isGameActive ? (
            <>
              <Target className="w-6 h-6" />
              <span>لعبة جارية...</span>
            </>
          ) : waitingPlayersCount < 2 ? (
            <>
              <Users className="w-6 h-6" />
              <span>في انتظار اللاعبين ({waitingPlayersCount}/2)</span>
            </>
          ) : (
            <>
              <Sparkles className="w-6 h-6 animate-pulse" />
              <span>ابدأ مبارزة المسدسات 🔫</span>
            </>
          )}
        </div>
      </button>

      {/* رسالة توضيحية */}
      {waitingPlayersCount < 2 && (
        <p className="text-center text-sm text-yellow-400/80 animate-pulse">
          اكتب <span className="font-mono bg-yellow-400/10 px-2 py-0.5 rounded">!دخول</span> في الشات للانضمام
        </p>
      )}

      {/* CSS للتأثير */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </div>
  );
}

// ============================================
// 📝 مثال الاستخدام في المكون الرئيسي
// ============================================

/*
import { StartDuelButton } from './StartDuelButton';

function YourMainComponent() {
  const socketRef = useRef<Socket | null>(null);
  const [waitingPlayers, setWaitingPlayers] = useState<WaitingPlayer[]>([]);
  const [gameState, setGameState] = useState({ status: 'waiting' });

  return (
    <div>
      // ... باقي الواجهة

      <StartDuelButton 
        socket={socketRef.current}
        waitingPlayersCount={waitingPlayers.length}
        isGameActive={gameState.status !== 'waiting'}
      />
    </div>
  );
}
*/

// ============================================
// 🎨 نسخة مصغرة (Compact Version)
// ============================================

export function CompactStartDuelButton({ socket, waitingPlayersCount, isGameActive }: StartDuelButtonProps) {
  return (
    <button
      onClick={() => socket?.emit('start_gun_duel')}
      disabled={waitingPlayersCount < 2 || isGameActive}
      className={`
        px-6 py-3 rounded-lg font-bold
        flex items-center gap-2
        transition-all duration-200
        ${waitingPlayersCount >= 2 && !isGameActive
          ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg'
          : 'bg-gray-600 text-gray-400 cursor-not-allowed'
        }
      `}
    >
      <Target className="w-5 h-5" />
      <span>مبارزة ({waitingPlayersCount}/2)</span>
    </button>
  );
}

// ============================================
// 🎯 نسخة مع أوامر الشات
// ============================================

export function DuelControlPanel({ socket, waitingPlayersCount, isGameActive }: StartDuelButtonProps) {
  return (
    <div className="bg-slate-800 rounded-xl p-6 space-y-4">

      {/* العنوان */}
      <div className="flex items-center gap-3 border-b border-slate-700 pb-3">
        <Target className="w-8 h-8 text-red-500" />
        <div>
          <h2 className="text-white font-bold text-xl">لوحة تحكم المبارزة</h2>
          <p className="text-slate-400 text-sm">إدارة لعبة مبارزة المسدسات</p>
        </div>
      </div>

      {/* الإحصائيات */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-700/50 rounded-lg p-4">
          <div className="text-slate-400 text-sm mb-1">اللاعبون</div>
          <div className="text-2xl font-bold text-cyan-400">{waitingPlayersCount}</div>
        </div>

        <div className="bg-slate-700/50 rounded-lg p-4">
          <div className="text-slate-400 text-sm mb-1">الحالة</div>
          <div className={`text-2xl font-bold ${isGameActive ? 'text-red-400' : 'text-green-400'}`}>
            {isGameActive ? '🎮 نشطة' : '⏸️ منتظرة'}
          </div>
        </div>
      </div>

      {/* الزر */}
      <StartDuelButton 
        socket={socket}
        waitingPlayersCount={waitingPlayersCount}
        isGameActive={isGameActive}
      />

      {/* الأوامر */}
      <div className="bg-slate-700/30 rounded-lg p-4 space-y-2">
        <div className="text-slate-400 text-sm mb-2">أوامر الشات المتاحة:</div>

        <div className="flex items-center gap-2">
          <code className="bg-slate-900 text-cyan-400 px-3 py-1 rounded font-mono text-sm">
            !دخول
          </code>
          <span className="text-slate-300 text-sm">للانضمام للقائمة</span>
        </div>

        <div className="flex items-center gap-2">
          <code className="bg-slate-900 text-red-400 px-3 py-1 rounded font-mono text-sm">
            !مبارزة
          </code>
          <span className="text-slate-300 text-sm">لبدء اللعبة من الشات</span>
        </div>
      </div>
    </div>
  );
}
