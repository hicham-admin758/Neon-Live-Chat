import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { GameCard } from "@/components/GameCard";
import { FeatureCard } from "@/components/FeatureCard";
import { StatCard } from "@/components/StatCard";
import { GameCircle } from "@/components/GameCircle";
import { ConnectionHeader } from "@/components/ConnectionHeader";
import { LiveLobby } from "@/components/LiveLobby";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function Home() {
  const [activeGame, setActiveGame] = useState<string | null>(null);

  if (activeGame === "chat-bomb") {
    return (
      <div className="min-h-screen h-screen bg-[#0a0a0a] flex flex-col items-center justify-start p-4 relative overflow-y-auto" dir="rtl">
        <Button 
          variant="ghost" 
          className="absolute top-8 right-8 text-white/70 hover:text-white z-50"
          onClick={() => setActiveGame(null)}
          data-testid="button-back-to-lobby"
        >
          <ArrowLeft className="ml-2" />
          العودة للرئيسية
        </Button>
        <div className="w-full max-w-4xl py-16">
          <GameCircle />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      <ConnectionHeader />
      <Header />

      <main className="mt-[160px] md:mt-[180px]">
        <LiveLobby />

        {/* Hero Section */}
        <section id="home" className="py-16 px-8 text-center relative overflow-hidden">
          <div className="absolute w-[500px] h-[500px] bg-[radial-gradient(circle,rgba(138,43,226,0.3),transparent)] -top-[200px] -right-[200px] rounded-full animate-pulse-slow pointer-events-none"></div>

          <h1 className="text-[2rem] md:text-[3.5rem] mb-6 font-bold text-gradient-hero animate-gradient-shift">
            منصة ألعاب التفاعل المباشر
          </h1>

          <p className="text-[1rem] md:text-[1.3rem] text-[#b8b8ff] mb-8 max-w-[800px] mx-auto leading-relaxed">
            انضم إلى آلاف اللاعبين حول العالم في تجربة ألعاب تفاعلية مباشرة بجودة عالية ومنافسات مثيرة
          </p>

          <a 
            href="#games" 
            className="btn-gradient text-white text-[1.2rem] px-12 py-4 rounded-[25px] font-bold inline-block transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(138,43,226,0.4)]"
          >
            استكشف الألعاب
          </a>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 max-w-[1200px] mx-auto mt-12 px-8">
            <StatCard number="50K+" label="لاعب نشط" />
            <StatCard number="200+" label="لعبة متاحة" />
            <StatCard number="24/7" label="دعم مباشر" />
            <StatCard number="99.9%" label="وقت التشغيل" />
          </div>
        </section>

        {/* Games Section */}
        <section id="games" className="py-16 px-4 md:px-8 max-w-[1400px] mx-auto overflow-hidden">
          <h2 className="text-center text-[2.5rem] mb-12 relative pb-4 after:content-[''] after:absolute after:bottom-0 after:left-1/2 after:-translate-x-1/2 after:w-[100px] after:h-[4px] after:bg-gradient-to-r after:from-[#8a2be2] after:to-[#00ffff] after:rounded-sm">
            الألعاب الأكثر شعبية
          </h2>

          <div className="flex justify-center">
            <div className="w-full max-w-[450px]">
              <GameCard 
                title="قنبلة الدردشة" 
                description="لعبة متفجرة حيث يتحكم الجمهور في الفوضى" 
                players="8,921" 
                icon="💣"
                gradient="linear-gradient(135deg, #0f172a 0%, #701a75 50%, #991b1b 100%)"
                onPlay={() => setActiveGame("chat-bomb")}
              />
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-16 px-8 bg-black/30">
          <h2 className="text-center text-[2.5rem] mb-12 relative pb-4 after:content-[''] after:absolute after:bottom-0 after:left-1/2 after:-translate-x-1/2 after:w-[100px] after:h-[4px] after:bg-gradient-to-r after:from-[#8a2be2] after:to-[#00ffff] after:rounded-sm">
            لماذا تختار منصتنا؟
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 max-w-[1200px] mx-auto">
            <FeatureCard 
              icon="⚡" 
              title="أداء فائق السرعة" 
              description="خوادم عالية الأداء تضمن تجربة لعب سلسة بدون تأخير" 
            />
            <FeatureCard 
              icon="🔒" 
              title="أمان محسّن" 
              description="حماية متقدمة لبياناتك وحسابك مع تشفير من الدرجة العسكرية" 
            />
            <FeatureCard 
              icon="🌍" 
              title="مجتمع عالمي" 
              description="تواصل مع ملايين اللاعبين من جميع أنحاء العالم" 
            />
            <FeatureCard 
              icon="🏅" 
              title="جوائز ومكافآت" 
              description="مسابقات يومية وجوائز قيمة للفائزين" 
            />
            <FeatureCard 
              icon="📱" 
              title="متعدد المنصات" 
              description="العب على الويب، الموبايل، أو الكمبيوتر بسلاسة" 
            />
            <FeatureCard 
              icon="💬" 
              title="دعم 24/7" 
              description="فريق دعم متاح دائماً لمساعدتك في أي وقت" 
            />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}