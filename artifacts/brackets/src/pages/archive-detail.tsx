import { useParams, Link } from "wouter";
import { useGetTournament } from "@workspace/api-client-react";
import BracketDisplay from "@/components/bracket-display";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, ArrowRight, Users, Calendar } from "lucide-react";
import { format } from "date-fns";

export default function ArchiveDetail() {
  const params = useParams();
  const id = parseInt(params.id || "0");
  
  const { data: tournament, isLoading } = useGetTournament(id, {
    query: { enabled: !!id }
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-32" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold text-destructive">لم يتم العثور على البطولة</h2>
        <Link href="/archive" className="text-primary hover:underline mt-4 inline-block">
          العودة للأرشيف
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Link href="/archive" className="text-muted-foreground hover:text-primary flex items-center gap-2 w-fit transition-colors">
        <ArrowRight className="h-4 w-4" />
        العودة للأرشيف
      </Link>

      <div className="bg-card border rounded-2xl p-6 md:p-8 shadow-lg relative overflow-hidden">
        {/* Background glow if there's a winner */}
        {tournament.winnerId && (
          <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
        )}
        
        <div className="relative z-10">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div>
              <div className="flex gap-2 mb-3">
                <Badge variant="outline" className="border-primary/50 text-primary">{tournament.type}</Badge>
                <Badge className={tournament.status === "archived" ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground"}>
                  {tournament.status === "archived" ? "مؤرشفة" : "مكتملة"}
                </Badge>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold">{tournament.name}</h1>
              
              <div className="flex flex-wrap gap-6 mt-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span>{tournament.participants?.length || 0} مشارك</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>{format(new Date(tournament.updatedAt), 'yyyy/MM/dd')}</span>
                </div>
              </div>
            </div>

            {tournament.winnerName && (
              <div className="bg-accent/10 border border-accent/20 rounded-xl p-4 min-w-[200px] text-center">
                <Trophy className="h-8 w-8 text-accent mx-auto mb-2" />
                <div className="text-xs text-accent/80 mb-1">بطل النسخة</div>
                <div className="font-bold text-xl text-accent">{tournament.winnerName}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-card border rounded-2xl p-6 shadow-lg overflow-x-auto">
        <h3 className="text-xl font-bold mb-6 border-b pb-4">جدول المباريات</h3>
        <BracketDisplay tournamentId={id} />
      </div>
    </div>
  );
}
