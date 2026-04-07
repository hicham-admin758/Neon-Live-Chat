import { useListTournaments, useListNews } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Trophy, ChevronLeft, Calendar } from "lucide-react";
import { format } from "date-fns";
import BracketDisplay from "@/components/bracket-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function Home() {
  const { data: tournaments, isLoading: isTournamentsLoading } = useListTournaments({ 
    query: { refetchInterval: 3000 } 
  });
  
  const { data: news, isLoading: isNewsLoading } = useListNews({
    query: { refetchInterval: 3000 }
  });

  const activeTournaments = tournaments?.filter(t => t.status === "active" || t.status === "pending") || [];
  const latestTournament = activeTournaments.length > 0 ? activeTournaments[0] : null;
  const recentNews = news?.slice(0, 3) || [];

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card p-8 md:p-12 shadow-[0_0_40px_-15px_rgba(0,240,255,0.3)]">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-50" />
        
        <div className="relative z-10 flex flex-col items-center text-center max-w-3xl mx-auto space-y-6">
          <Badge variant="outline" className="border-primary text-primary px-4 py-1 text-sm bg-primary/10">
            المنصة الأولى للبطولات
          </Badge>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight">
            المنافسة تبدأ <span className="text-primary drop-shadow-[0_0_10px_rgba(0,240,255,0.8)]">هنا</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
            تابع أحدث البطولات، شاهد النتائج لحظة بلحظة، وكن جزءاً من مجتمع الرياضات الإلكترونية الأقوى.
          </p>
        </div>
      </section>

      {/* Active Tournament Section */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-primary" />
            البطولة الحالية
          </h2>
          <Link href="/archive" className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1">
            عرض كل البطولات
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </div>

        {isTournamentsLoading ? (
          <Skeleton className="h-[400px] w-full rounded-xl" />
        ) : latestTournament ? (
          <div className="rounded-xl border bg-card p-6 shadow-lg">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-2xl font-bold text-white">{latestTournament.name}</h3>
                <div className="flex gap-2 mt-2">
                  <Badge variant="secondary">{latestTournament.type}</Badge>
                  <Badge className="bg-primary/20 text-primary hover:bg-primary/30 border-primary/50">
                    {latestTournament.status === 'active' ? 'جارية الآن' : 'في الانتظار'}
                  </Badge>
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto pb-4">
              <BracketDisplay tournamentId={latestTournament.id} />
            </div>
          </div>
        ) : (
          <Card className="border-dashed border-muted-foreground/30 bg-card/50">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Trophy className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">لا توجد بطولات جارية</h3>
              <p className="text-muted-foreground">ترقبوا البطولات القادمة قريباً</p>
            </CardContent>
          </Card>
        )}
      </section>

      {/* News Ticker / Latest News */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" />
            أحدث الأخبار
          </h2>
          <Link href="/news" className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1">
            عرض كل الأخبار
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {isNewsLoading ? (
            Array(3).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-[200px] rounded-xl" />
            ))
          ) : recentNews.length > 0 ? (
            recentNews.map((article) => (
              <Card key={article.id} className="bg-card hover:border-primary/50 transition-colors">
                <CardHeader>
                  <CardTitle className="text-lg line-clamp-2">{article.title}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-2">
                    {format(new Date(article.createdAt), 'yyyy/MM/dd')}
                  </p>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {article.content}
                  </p>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="col-span-3 text-center py-12 text-muted-foreground">
              لا توجد أخبار حالياً
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
