interface FeatureCardProps {
  icon: string;
  title: string;
  description: string;
}

export function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="text-center p-8 bg-glass-card rounded-[15px] border border-purple-500/30 transition-all duration-300 hover:-translate-y-2 hover:border-[#ff00ff]">
      <div className="text-[3rem] mb-4">{icon}</div>
      <h3 className="text-[1.3rem] mb-4 text-cyan-400 font-bold">{title}</h3>
      <p className="text-[#b8b8ff] leading-relaxed">{description}</p>
    </div>
  );
}
