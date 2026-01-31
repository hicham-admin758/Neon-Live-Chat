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
import YouTubeGunDuelOverlay from "@/components/YouTubeGunDuelOverlay";

export default function Home() {
  const [activeGame, setActiveGame] = useState<string | null>(null);

  if (activeGame === "chat-bomb") {
    return (
      <div className="min-h-screen h-screen bg-[#0a0a0a] flex flex-col items-center justify-start p-4 relative overflow-y-auto" dir="rtl">
        <Button 
          variant="ghost" 
          className="absolute top-8 right-8 text-white/70 hover:text-white z-50 font-bold"
          onClick={() => setActiveGame(null)}
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

  if (activeGame === "gun-duel") {
    return (
      <div className="min-h-screen h-screen bg-[#050505] flex flex-col items-center justify-center p-4 relative" dir="rtl">
        <Button 
          variant="ghost" 
          className="absolute top-8 right-8 text-white/70 hover:text-white z-50 font-bold"
          onClick={() => setActiveGame(null)}
        >
          <ArrowLeft className="ml-2" />
          العودة للرئيسية
        </Button>
        <div className="w-full max-w-7xl flex justify-center">
          <YouTubeGunDuelOverlay />
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

        <section id="games" className="py-16 px-4 md:px-8 max-w-[1200px] mx-auto text-center">
          <h2 className="text-[2.5rem] mb-12 font-bold text-white">الألعاب المتاحة</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 justify-items-center">
            <GameCard 
              title="قنبلة الدردشة" 
              description="لعبة متفجرة يتحكم بها الجمهور" 
              players="8.9K" 
              icon="💣"
              gradient="linear-gradient(135deg, #1e1b4b 0%, #701a75 100%)"
              onPlay={() => setActiveGame("chat-bomb")}
            />

            <GameCard 
              title="مبارزة المسدسات" 
              description="اكتب !دخول في شات اليوتيوب للانضمام" 
              players="4.1K" 
              icon="🔫"
              gradient="linear-gradient(135deg, #7f1d1d 0%, #dc2626 100%)"
              onPlay={() => setActiveGame("gun-duel")}
            />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}