import { useState } from "react";
import { 
  useListTournaments, 
  useCreateTournament, 
  useDeleteTournament, 
  useArchiveTournament,
  useGetTournament,
  useAddParticipant,
  useGenerateBracket,
  useUpdateMatch,
  getListTournamentsQueryKey,
  getGetTournamentQueryKey,
  getListMatchesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Archive, Play, Trophy, Users, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function TournamentManager() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: tournaments, isLoading } = useListTournaments();
  const createTournament = useCreateTournament();
  const deleteTournament = useDeleteTournament();
  const archiveTournament = useArchiveTournament();

  const [newTName, setNewTName] = useState("");
  const [newTType, setNewTType] = useState("1v1");
  const [selectedTournament, setSelectedTournament] = useState<number | null>(null);

  const handleCreate = () => {
    if (!newTName) return;
    createTournament.mutate({ data: { name: newTName, type: newTType } }, {
      onSuccess: () => {
        setNewTName("");
        queryClient.invalidateQueries({ queryKey: getListTournamentsQueryKey() });
        toast({ title: "تم إنشاء البطولة بنجاح" });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذه البطولة نهائياً؟")) return;
    deleteTournament.mutate({ id }, {
      onSuccess: () => {
        if (selectedTournament === id) setSelectedTournament(null);
        queryClient.invalidateQueries({ queryKey: getListTournamentsQueryKey() });
        toast({ title: "تم حذف البطولة" });
      }
    });
  };

  const handleArchive = (id: number) => {
    if (!confirm("هل أنت متأكد من أرشفة هذه البطولة؟")) return;
    archiveTournament.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTournamentsQueryKey() });
        toast({ title: "تمت أرشفة البطولة" });
      }
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-6">
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-xl">إنشاء بطولة جديدة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">اسم البطولة</label>
              <Input 
                value={newTName} 
                onChange={(e) => setNewTName(e.target.value)} 
                placeholder="أدخل اسم البطولة..."
                data-testid="input-tournament-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">النوع</label>
              <Select value={newTType} onValueChange={setNewTType}>
                <SelectTrigger data-testid="select-tournament-type">
                  <SelectValue placeholder="اختر النوع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1v1">1v1</SelectItem>
                  <SelectItem value="2v2">2v2</SelectItem>
                  <SelectItem value="3v3">3v3</SelectItem>
                  <SelectItem value="4v4">4v4</SelectItem>
                  <SelectItem value="5v5">5v5</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button 
              className="w-full mt-2" 
              onClick={handleCreate}
              disabled={createTournament.isPending || !newTName}
              data-testid="button-create-tournament"
            >
              {createTournament.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 ml-2" />}
              إنشاء
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">البطولات الحالية</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : tournaments?.map(t => (
              <div 
                key={t.id} 
                className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedTournament === t.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                onClick={() => setSelectedTournament(t.id)}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold">{t.name}</span>
                  <Badge variant={t.status === 'active' ? 'default' : t.status === 'pending' ? 'secondary' : 'outline'}>
                    {t.status === 'active' ? 'جارية' : t.status === 'pending' ? 'في الانتظار' : t.status === 'completed' ? 'مكتملة' : 'مؤرشفة'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-muted-foreground">{t.type}</span>
                  <div className="flex gap-1">
                    {t.status === 'completed' && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleArchive(t.id); }} title="أرشفة">
                        <Archive className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }} title="حذف">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {tournaments?.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-4">لا توجد بطولات. قم بإنشاء واحدة.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-2">
        {selectedTournament ? (
          <TournamentDetailAdmin tournamentId={selectedTournament} />
        ) : (
          <Card className="h-full flex flex-col items-center justify-center min-h-[400px] border-dashed bg-muted/10">
            <Trophy className="h-16 w-16 text-muted-foreground/20 mb-4" />
            <p className="text-muted-foreground">اختر بطولة من القائمة الجانبية لإدارتها</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function TournamentDetailAdmin({ tournamentId }: { tournamentId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: tournament, isLoading } = useGetTournament(tournamentId);
  const addParticipant = useAddParticipant();
  const generateBracket = useGenerateBracket();
  const updateMatch = useUpdateMatch();
  
  const [newPName, setNewPName] = useState("");
  const [selectedMatch, setSelectedMatch] = useState<any>(null);
  const [score1, setScore1] = useState("");
  const [score2, setScore2] = useState("");

  if (isLoading || !tournament) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const handleAddParticipant = () => {
    if (!newPName) return;
    addParticipant.mutate({ data: { tournamentId, name: newPName } }, {
      onSuccess: () => {
        setNewPName("");
        queryClient.invalidateQueries({ queryKey: getGetTournamentQueryKey(tournamentId) });
      }
    });
  };

  const handleGenerateBracket = () => {
    if (tournament.participants.length < 2) {
      toast({ variant: "destructive", title: "خطأ", description: "يجب إضافة مشاركين اثنين على الأقل" });
      return;
    }
    generateBracket.mutate({ id: tournamentId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTournamentQueryKey(tournamentId) });
        queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey(tournamentId) });
        toast({ title: "تم توليد الجدول بنجاح" });
      }
    });
  };

  const handleUpdateMatch = (status: "ongoing" | "completed", winnerId?: number | null) => {
    if (!selectedMatch) return;
    
    updateMatch.mutate({ 
      id: selectedMatch.id, 
      data: { 
        score1, 
        score2, 
        status, 
        winnerId,
        winnerName: winnerId === selectedMatch.participant1Id ? selectedMatch.participant1Name : winnerId === selectedMatch.participant2Id ? selectedMatch.participant2Name : null
      } 
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTournamentQueryKey(tournamentId) });
        queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey(tournamentId) });
        if (status === "completed") setSelectedMatch(null);
        toast({ title: "تم تحديث النتيجة" });
      }
    });
  };

  return (
    <Card className="h-full border-primary/20 shadow-lg">
      <CardHeader className="border-b bg-muted/10 pb-4">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-2xl mb-2">{tournament.name}</CardTitle>
            <div className="flex gap-2">
              <Badge>{tournament.type}</Badge>
              <Badge variant="outline">{tournament.status}</Badge>
            </div>
          </div>
          {tournament.status === 'pending' && (
            <Button 
              onClick={handleGenerateBracket}
              disabled={generateBracket.isPending || tournament.participants.length < 2}
              className="bg-primary text-black hover:bg-primary/90"
              data-testid="button-generate-bracket"
            >
              {generateBracket.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 ml-2" />}
              بدء البطولة وتوليد الجدول
            </Button>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="pt-6 space-y-8">
        {tournament.status === 'pending' && (
          <div className="space-y-4">
            <h3 className="font-bold text-lg flex items-center gap-2 border-b pb-2">
              <Users className="h-5 w-5" /> إضافة مشاركين
            </h3>
            <div className="flex gap-2 max-w-md">
              <Input 
                value={newPName} 
                onChange={(e) => setNewPName(e.target.value)} 
                placeholder="اسم اللاعب أو الفريق..."
                data-testid="input-participant-name"
                onKeyDown={(e) => e.key === 'Enter' && handleAddParticipant()}
              />
              <Button onClick={handleAddParticipant} disabled={!newPName || addParticipant.isPending}>إضافة</Button>
            </div>
            
            <div className="flex flex-wrap gap-2 mt-4">
              {tournament.participants?.map((p: any) => (
                <Badge key={p.id} variant="secondary" className="px-3 py-1 text-sm">{p.name}</Badge>
              ))}
              {(!tournament.participants || tournament.participants.length === 0) && (
                <span className="text-sm text-muted-foreground">لا يوجد مشاركين بعد</span>
              )}
            </div>
          </div>
        )}

        {(tournament.status === 'active' || tournament.status === 'completed') && (
          <div className="space-y-4">
            <h3 className="font-bold text-lg flex items-center gap-2 border-b pb-2">
              <RefreshCw className="h-5 w-5" /> تحديث النتائج
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tournament.matches?.map((match: any) => (
                <Dialog key={match.id} open={selectedMatch?.id === match.id} onOpenChange={(open) => {
                  if (open) {
                    setSelectedMatch(match);
                    setScore1(match.score1 || "");
                    setScore2(match.score2 || "");
                  } else {
                    setSelectedMatch(null);
                  }
                }}>
                  <DialogTrigger asChild>
                    <div className={`p-4 rounded-xl border cursor-pointer transition-all hover:border-primary/50 ${match.status === 'ongoing' ? 'bg-primary/5 border-primary' : 'bg-card'}`}>
                      <div className="text-xs text-muted-foreground mb-2 flex justify-between">
                        <span>مباراة #{match.matchNumber} - الجولة {match.round}</span>
                        {match.status === 'completed' && <span className="text-muted-foreground">مكتملة</span>}
                        {match.status === 'ongoing' && <span className="text-primary animate-pulse">جارية</span>}
                      </div>
                      <div className="flex justify-between items-center bg-muted/30 p-2 rounded mb-1">
                        <span className={match.winnerId === match.participant1Id ? 'font-bold text-accent' : ''}>{match.participant1Name || '---'}</span>
                        <span className="font-mono font-bold">{match.score1 ?? '-'}</span>
                      </div>
                      <div className="flex justify-between items-center bg-muted/30 p-2 rounded">
                        <span className={match.winnerId === match.participant2Id ? 'font-bold text-accent' : ''}>{match.participant2Name || '---'}</span>
                        <span className="font-mono font-bold">{match.score2 ?? '-'}</span>
                      </div>
                    </div>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]" dir="rtl">
                    <DialogHeader>
                      <DialogTitle>تحديث نتيجة المباراة</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="flex-1 space-y-2">
                          <label className="text-sm font-bold truncate block">{match.participant1Name || '---'}</label>
                          <Input 
                            value={score1} 
                            onChange={(e) => setScore1(e.target.value)} 
                            placeholder="النتيجة"
                            className="text-center font-mono text-xl h-12"
                            dir="ltr"
                          />
                          <Button 
                            variant={match.winnerId === match.participant1Id ? "default" : "outline"}
                            className={`w-full ${match.winnerId === match.participant1Id ? 'bg-accent text-black hover:bg-accent/90' : ''}`}
                            onClick={() => handleUpdateMatch("completed", match.participant1Id)}
                            disabled={!match.participant1Id}
                          >
                            فوز
                          </Button>
                        </div>
                        <div className="text-2xl font-bold text-muted-foreground">VS</div>
                        <div className="flex-1 space-y-2">
                          <label className="text-sm font-bold truncate block">{match.participant2Name || '---'}</label>
                          <Input 
                            value={score2} 
                            onChange={(e) => setScore2(e.target.value)} 
                            placeholder="النتيجة"
                            className="text-center font-mono text-xl h-12"
                            dir="ltr"
                          />
                          <Button 
                            variant={match.winnerId === match.participant2Id ? "default" : "outline"}
                            className={`w-full ${match.winnerId === match.participant2Id ? 'bg-accent text-black hover:bg-accent/90' : ''}`}
                            onClick={() => handleUpdateMatch("completed", match.participant2Id)}
                            disabled={!match.participant2Id}
                          >
                            فوز
                          </Button>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 pt-4 border-t">
                        <Button 
                          variant="secondary" 
                          className="flex-1"
                          onClick={() => handleUpdateMatch("ongoing", null)}
                        >
                          تحديث فقط (جارية)
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
