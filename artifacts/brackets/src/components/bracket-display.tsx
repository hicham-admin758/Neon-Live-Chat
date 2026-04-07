import { useListMatches, useGetTournament } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface BracketDisplayProps {
  tournamentId: number;
}

export default function BracketDisplay({ tournamentId }: BracketDisplayProps) {
  const { data: tournament, isLoading: isTournamentLoading } = useGetTournament(tournamentId, {
    query: { refetchInterval: 3000 }
  });
  
  const { data: matches, isLoading: isMatchesLoading } = useListMatches(tournamentId, {
    query: { refetchInterval: 3000 }
  });

  if (isTournamentLoading || isMatchesLoading) {
    return <Skeleton className="w-full h-[500px] rounded-xl" />;
  }

  if (!matches || matches.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground border-2 border-dashed border-border rounded-xl">
        لم يتم إنشاء جدول المباريات بعد
      </div>
    );
  }

  // Group matches by round
  const rounds = matches.reduce((acc, match) => {
    if (!acc[match.round]) {
      acc[match.round] = [];
    }
    acc[match.round].push(match);
    return acc;
  }, {} as Record<number, typeof matches>);

  const roundNumbers = Object.keys(rounds).map(Number).sort((a, b) => a - b);
  const totalRounds = roundNumbers.length;

  const getRoundName = (roundNum: number, total: number) => {
    if (roundNum === total) return "النهائي";
    if (roundNum === total - 1 && total > 1) return "نصف النهائي";
    if (roundNum === total - 2 && total > 2) return "ربع النهائي";
    return `الجولة ${roundNum}`;
  };

  return (
    <div className="flex gap-12 overflow-x-auto pb-8 pt-4 px-4 min-w-max" dir="rtl">
      {roundNumbers.map((roundNum, roundIdx) => (
        <div key={roundNum} className="flex flex-col gap-8 justify-around min-w-[280px]">
          <div className="text-center font-bold text-primary mb-4 bg-primary/10 py-2 rounded-lg border border-primary/20">
            {getRoundName(roundNum, totalRounds)}
          </div>
          
          {rounds[roundNum].sort((a, b) => a.matchNumber - b.matchNumber).map((match) => (
            <motion.div 
              key={match.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: roundIdx * 0.1 }}
              className="relative"
            >
              {/* Connector lines to next round */}
              {roundNum < totalRounds && (
                <div className="absolute left-[-3rem] top-1/2 w-12 h-[2px] bg-border z-0" />
              )}
              
              <div className={cn(
                "relative z-10 flex flex-col rounded-lg border bg-card overflow-hidden shadow-lg transition-all",
                match.status === "ongoing" && "border-primary shadow-[0_0_15px_rgba(0,240,255,0.3)]",
                match.status === "completed" && "border-muted"
              )}>
                {/* Match Header */}
                <div className="bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground flex justify-between items-center border-b">
                  <span>مباراة #{match.matchNumber}</span>
                  {match.status === "ongoing" && (
                    <span className="flex items-center gap-1 text-primary">
                      <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                      جارية
                    </span>
                  )}
                  {match.status === "completed" && <span>مكتملة</span>}
                </div>

                {/* Participant 1 */}
                <div className={cn(
                  "flex justify-between items-center px-4 py-3 border-b transition-colors",
                  match.winnerId === match.participant1Id && match.participant1Id !== null
                    ? "bg-accent/10 font-bold" 
                    : "hover:bg-muted/30"
                )}>
                  <span className={cn(
                    "truncate pr-2",
                    !match.participant1Name && "text-muted-foreground italic",
                    match.winnerId === match.participant1Id && match.participant1Id !== null && "text-accent"
                  )}>
                    {match.participant1Name || "في الانتظار..."}
                  </span>
                  <span className={cn(
                    "font-mono text-lg font-bold min-w-[2rem] text-center",
                    match.winnerId === match.participant1Id && match.participant1Id !== null ? "text-accent" : "text-foreground"
                  )}>
                    {match.score1 ?? "-"}
                  </span>
                </div>

                {/* Participant 2 */}
                <div className={cn(
                  "flex justify-between items-center px-4 py-3 transition-colors",
                  match.winnerId === match.participant2Id && match.participant2Id !== null
                    ? "bg-accent/10 font-bold" 
                    : "hover:bg-muted/30"
                )}>
                  <span className={cn(
                    "truncate pr-2",
                    !match.participant2Name && "text-muted-foreground italic",
                    match.winnerId === match.participant2Id && match.participant2Id !== null && "text-accent"
                  )}>
                    {match.participant2Name || "في الانتظار..."}
                  </span>
                  <span className={cn(
                    "font-mono text-lg font-bold min-w-[2rem] text-center",
                    match.winnerId === match.participant2Id && match.participant2Id !== null ? "text-accent" : "text-foreground"
                  )}>
                    {match.score2 ?? "-"}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ))}
    </div>
  );
}
