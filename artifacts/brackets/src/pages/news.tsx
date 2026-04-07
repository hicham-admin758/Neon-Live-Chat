import { useListNews } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Newspaper, Calendar } from "lucide-react";
import { format } from "date-fns";

export default function News() {
  const { data: news, isLoading } = useListNews({
    query: { refetchInterval: 5000 }
  });

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <div className="p-3 bg-primary/10 rounded-xl">
          <Newspaper className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">آخر الأخبار</h1>
          <p className="text-muted-foreground mt-1">تغطية حصرية لجميع البطولات والأحداث</p>
        </div>
      </div>

      <div className="space-y-6">
        {isLoading ? (
          Array(4).fill(0).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))
        ) : news && news.length > 0 ? (
          news.map((article) => (
            <Card key={article.id} className="overflow-hidden hover:border-primary/50 transition-colors bg-card/50">
              <CardHeader className="bg-muted/20 pb-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <Calendar className="h-3.5 w-3.5" />
                  <span className="font-mono">{format(new Date(article.createdAt), 'yyyy/MM/dd HH:mm')}</span>
                </div>
                <CardTitle className="text-2xl text-primary/90">{article.title}</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <p className="text-foreground/80 leading-relaxed whitespace-pre-wrap">
                  {article.content}
                </p>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="text-center py-20 border-2 border-dashed rounded-xl border-border bg-card/30">
            <Newspaper className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">لا توجد أخبار</h3>
            <p className="text-muted-foreground">لم يتم نشر أي أخبار حتى الآن.</p>
          </div>
        )}
      </div>
    </div>
  );
}
