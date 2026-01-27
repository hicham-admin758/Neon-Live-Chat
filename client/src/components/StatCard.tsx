interface StatCardProps {
  number: string;
  label: string;
}

export function StatCard({ number, label }: StatCardProps) {
  return (
    <div className="bg-glass-card backdrop-blur-md p-8 rounded-[15px] text-center border border-purple-500/30 transition-all duration-300 hover:-translate-y-2 hover:border-cyan-400 hover:shadow-[0_10px_30px_rgba(0,255,255,0.2)]">
      <div className="text-[2.5rem] font-bold text-cyan-400 mb-2">{number}</div>
      <div className="text-[#b8b8ff] text-base">{label}</div>
    </div>
  );
}
