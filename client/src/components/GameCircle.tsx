import { useUsers, useGameCircle } from "@/hooks/use-users";
import { User } from "lucide-react";

export function GameCircle() {
  const { data: users, isLoading } = useUsers();
  const { isConnected } = useGameCircle();

  return (
    <section id="game-circle" className="py-16 px-8 max-w-[1400px] mx-auto">
      <h2 className="text-center text-[2.5rem] mb-12 relative pb-4 after:content-[''] after:absolute after:bottom-0 after:left-1/2 after:-translate-x-1/2 after:w-[100px] after:h-[4px] after:bg-gradient-to-r after:from-[#8a2be2] after:to-[#00ffff] after:rounded-sm">
        ساحة اللعب المباشرة
        <span className="block text-sm font-normal text-cyan-400 mt-2">
          {isConnected ? "🟢 متصل بالخادم" : "🔴 غير متصل"}
        </span>
      </h2>

      <div className="bg-glass-card border border-purple-500/30 rounded-[20px] p-8 min-h-[300px]">
        {isLoading ? (
          <div className="flex justify-center items-center h-[200px] text-[#b8b8ff]">
            جاري تحميل اللاعبين...
          </div>
        ) : !users || users.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[200px] text-[#b8b8ff] gap-4">
            <User size={48} className="opacity-50" />
            <p>لا يوجد لاعبين نشطين حالياً. كن أول من ينضم!</p>
            <p className="text-sm bg-purple-900/50 px-4 py-2 rounded-lg border border-purple-500/30">
              اكتب <span className="text-cyan-400 font-mono font-bold mx-1">!دخول</span> في شات اليوتيوب للانضمام
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {users.map((user, idx) => (
              <div 
                key={user.id} 
                className="flex flex-col items-center gap-3 animate-in fade-in zoom-in duration-500"
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                <div className="relative group cursor-pointer">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-cyan-400 p-[2px] shadow-lg shadow-purple-500/20 transition-transform group-hover:scale-110">
                    <div className="w-full h-full rounded-full bg-[#1a1f3a] flex items-center justify-center overflow-hidden">
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl font-bold text-white uppercase">{user.username.slice(0, 2)}</span>
                      )}
                    </div>
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 border-2 border-[#1a1f3a] rounded-full"></div>
                </div>
                <span className="text-white font-medium text-center truncate w-full px-2">{user.username}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
