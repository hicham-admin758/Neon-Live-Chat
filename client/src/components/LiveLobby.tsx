import { useUsers } from "@/hooks/use-users";

export function LiveLobby() {
  const { data: users, isLoading } = useUsers();

  return (
    <section className="py-8 px-4 bg-black/40 border-y border-purple-500/20 overflow-hidden">
      <div className="max-w-[1400px] mx-auto flex items-center gap-6">
        <div className="flex-shrink-0">
          <h3 className="text-cyan-400 font-bold text-lg whitespace-nowrap">اللاعبون النشطون:</h3>
          <p className="text-[#b8b8ff] text-xs">({users?.length || 0} لاعب)</p>
        </div>
        
        <div className="flex-1 overflow-hidden relative">
          <div className="flex gap-4 animate-scroll-lobby whitespace-nowrap">
            {isLoading ? (
              <p className="text-white/50">جاري التحميل...</p>
            ) : users?.map((user) => (
              <div key={user.id} className="flex items-center gap-2 bg-glass-card border border-purple-500/30 px-3 py-1.5 rounded-full">
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
