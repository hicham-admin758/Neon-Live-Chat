import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { GameCard } from "@/components/GameCard";
import { FeatureCard } from "@/components/FeatureCard";
import { StatCard } from "@/components/StatCard";
import { GameCircle } from "@/components/GameCircle";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      <Header />
      
      {/* Hero Section */}
      <section id="home" className="mt-[100px] py-16 px-8 text-center relative overflow-hidden">
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

      {/* Game Circle - Live Players */}
      <GameCircle />

      {/* Games Section */}
      <section id="games" className="py-16 px-8 max-w-[1400px] mx-auto">
        <h2 className="text-center text-[2.5rem] mb-12 relative pb-4 after:content-[''] after:absolute after:bottom-0 after:left-1/2 after:-translate-x-1/2 after:w-[100px] after:h-[4px] after:bg-gradient-to-r after:from-[#8a2be2] after:to-[#00ffff] after:rounded-sm">
          الألعاب الأكثر شعبية
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <GameCard 
            title="معركة الملوك" 
            description="لعبة استراتيجية جماعية مع منافسات حماسية في الوقت الفعلي" 
            players="12,543" 
            icon="🎯"
            gradient="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
          />
          <GameCard 
            title="ساحة القتال" 
            description="منافسات PvP مباشرة مع نظام تصنيف عالمي متقدم" 
            players="8,921" 
            icon="⚔️"
            gradient="linear-gradient(135deg, #f093fb 0%, #f5576c 100%)"
          />
          <GameCard 
            title="بطولة الأبطال" 
            description="مسابقات يومية مع جوائز قيمة وتحديات مستمرة" 
            players="15,678" 
            icon="🏆"
            gradient="linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)"
          />
          <GameCard 
            title="صالة الألعاب" 
            description="مجموعة متنوعة من الألعاب الكلاسيكية والحديثة" 
            players="9,234" 
            icon="🎲"
            gradient="linear-gradient(135deg, #fa709a 0%, #fee140 100%)"
          />
          <GameCard 
            title="ألغاز العقل" 
            description="تحديات ذهنية وألغاز محيرة لتنمية مهاراتك" 
            players="6,789" 
            icon="🧩"
            gradient="linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)"
          />
          <GameCard 
            title="مغامرات الفضاء" 
            description="رحلة ملحمية في عالم الفضاء الواسع" 
            players="11,456" 
            icon="🎮"
            gradient="linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)"
          />
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

      <Footer />
    </div>
  );
}
