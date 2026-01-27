import { Play } from "lucide-react";

interface GameCardProps {
  title: string;
  description: string;
  players: string;
  icon: string;
  gradient: string;
}

export function GameCard({ title, description, players, icon, gradient }: GameCardProps) {
  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    alert(`جاري تحميل لعبة: ${title}...`);
  };

  const handleCardClick = () => {
    console.log(`تم النقر على لعبة: ${title}`);
  };

  return (
    <div 
      onClick={handleCardClick}
      className="bg-glass-card backdrop-blur-md rounded-[20px] overflow-hidden border border-purple-500/30 transition-all duration-300 cursor-pointer relative group hover:-translate-y-2 hover:border-cyan-400 hover:shadow-[0_15px_40px_rgba(0,255,255,0.3)]"
    >
      <div className="absolute top-[15px] left-[15px] bg-red-600 px-[0.8rem] py-[0.3rem] rounded-[20px] text-[0.8rem] font-bold z-10 animate-blink text-white">
        🔴 LIVE
      </div>

      <div 
        className="w-full h-[200px] flex items-center justify-center text-[4rem] relative overflow-hidden"
        style={{ background: gradient }}
      >
        <div className="absolute w-full h-full bg-black/30 top-0 left-0"></div>
        <span className="relative z-10 drop-shadow-lg">{icon}</span>
      </div>

      <div className="p-6">
        <h3 className="text-[1.5rem] mb-2 text-white font-bold">{title}</h3>
        <p className="text-[#b8b8ff] mb-4 text-[0.95rem]">{description}</p>
        
        <div className="flex justify-between items-center pt-4 border-t border-purple-500/30">
          <div className="flex items-center gap-2 text-cyan-400">
            <span>👥</span>
            <span>{players} لاعب</span>
          </div>
          <button 
            onClick={handlePlayClick}
            className="btn-gradient text-white border-none px-6 py-2.5 rounded-[20px] font-bold cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-[0_5px_15px_rgba(138,43,226,0.4)] flex items-center gap-2"
          >
            <Play size={16} fill="currentColor" />
            العب الآن
          </button>
        </div>
      </div>
    </div>
  );
}
