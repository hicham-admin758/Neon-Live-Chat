import { useUsers } from "@/hooks/use-users";
import { useEffect } from "react";
import { io } from "socket.io-client";
import { queryClient } from "@/lib/queryClient";
import { api } from "@shared/routes";

export function LiveLobby() {
  const { data: users, isLoading } = useUsers();
  
  useEffect(() => {
    const socket = io({ path: "/socket.io" });
    
    const handleUpdate = () => {
      queryClient.invalidateQueries({ queryKey: [api.users.list.path] });
    };

    socket.on("new_player", handleUpdate);
    socket.on("player_eliminated", handleUpdate);
    socket.on("game_reset", handleUpdate);
    socket.on("game_winner", handleUpdate);

    return () => {
      socket.disconnect();
    };
  }, []);

  const activePlayers = users?.filter(u => u.lobbyStatus === "active") || [];

  return (
    <section id="active-players" className="py-8 px-4 bg-black/40 border-y border-purple-500/20 overflow-hidden">
      <div className="max-w-[1400px] mx-auto flex items-center gap-6">
        <div className="flex-shrink-0">
          <h3 className="text-cyan-400 font-bold text-lg whitespace-nowrap">اللاعبون النشطون:</h3>
          <p className="text-[#b8b8ff] text-xs">({activePlayers.length} لاعب)</p>
        </div>
        
        <div className="flex-1 overflow-hidden relative">
          <div className="flex gap-4 animate-scroll-lobby whitespace-nowrap">
            {isLoading ? (
              <p className="text-white/50">جاري التحميل...</p>
            ) : activePlayers.length === 0 ? (
              <p className="text-white/30 text-sm">لا يوجد لاعبين نشطين. اكتب !دخول للانضمام!</p>
            ) : activePlayers.map((user) => (
              <div key={user.id} className="flex items-center gap-2 bg-glass-card border border-purple-500/30 px-3 py-1.5 rounded-full relative group">
                <div className="absolute -top-2 -left-1 bg-cyan-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-white z-10">
                  #{user.id}
                </div>
                <div className="w-8 h-8 rounded-full overflow-hidden border border-cyan-400/50">
                  <img src={user.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} alt={user.username} className="w-full h-full object-cover" />
                </div>
                <span className="text-white text-sm font-medium">{user.username}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
