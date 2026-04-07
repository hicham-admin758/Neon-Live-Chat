import { useListTournaments } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Archive as ArchiveIcon, Trophy, Users } from "lucide-react";

export default function Archive() {
  const { data: tournaments, isLoading } = useListTournaments();
  
  const archivedTournaments = tournaments?.filter(t => t.status === "archived" || t.status === "completed") || [];

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <div className="p-3 bg-primary/10 rounded-xl">
          <ArchiveIcon className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">أرشيف البطولات</h1>
          <p className="text-muted-foreground mt-1">تصفح نتائج البطولات السابقة والمنتهية</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array(6).fill(0).map((_, i) => (
            <Skeleton key={i} className="h-[200px] rounded-xl" />
          ))}
        </div>
      ) : archivedTournaments.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {archivedTournaments.map((tournament) => (
            <Link key={tournament.id} href={`/archive/${tournament.id}`}>
              <Card className="h-full hover:border-primary/50 transition-all hover:shadow-[0_0_20px_-5px_rgba(0,240,255,0.2)] cursor-pointer group">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <Badge variant="outline" className="bg-muted">
                      {tournament.type}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">
                      {format(new Date(tournament.updatedAt), 'yyyy/MM/dd')}
                    </span>
                  </div>
                  <CardTitle className="text-xl mt-2 group-hover:text-primary transition-colors">
                    {tournament.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                    <Users className="h-4 w-4" />
                    <span>{tournament.participants?.length || 0} مشاركين</span>
                  </div>
                </CardContent>
                <CardFooter className="bg-muted/30 border-t pt-4">
                  <div className="flex items-center gap-2 w-full">
                    <Trophy className="h-5 w-5 text-accent" />
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">الفائز بالبطولة</span>
                      <span className="font-bold text-accent">{tournament.winnerName || "غير محدد"}</span>
                    </div>
                  </div>
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 border-2 border-dashed rounded-xl border-border bg-card/30">
          <ArchiveIcon className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-xl font-bold mb-2">لا يوجد أرشيف</h3>
          <p className="text-muted-foreground">لم يتم الانتهاء من أي بطولات بعد.</p>
        </div>
      )}
    </div>
  );
}
