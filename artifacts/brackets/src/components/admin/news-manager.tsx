import { useState } from "react";
import { useListNews, useCreateNews, useDeleteNews, getListNewsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Edit } from "lucide-react";
import { format } from "date-fns";

export default function NewsManager() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: news, isLoading } = useListNews();
  const createNews = useCreateNews();
  const deleteNews = useDeleteNews();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const handleCreate = () => {
    if (!title || !content) return;
    createNews.mutate({ data: { title, content } }, {
      onSuccess: () => {
        setTitle("");
        setContent("");
        queryClient.invalidateQueries({ queryKey: getListNewsQueryKey() });
        toast({ title: "تم نشر الخبر بنجاح" });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذا الخبر؟")) return;
    deleteNews.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNewsQueryKey() });
        toast({ title: "تم حذف الخبر" });
      }
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1">
        <Card className="border-primary/20 sticky top-24">
          <CardHeader>
            <CardTitle className="text-xl">إضافة خبر جديد</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">عنوان الخبر</label>
              <Input 
                value={title} 
                onChange={(e) => setTitle(e.target.value)} 
                placeholder="أدخل العنوان هنا..."
                data-testid="input-news-title"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">المحتوى</label>
              <Textarea 
                value={content} 
                onChange={(e) => setContent(e.target.value)} 
                placeholder="اكتب تفاصيل الخبر..."
                className="min-h-[150px] resize-none"
                data-testid="textarea-news-content"
              />
            </div>
            <Button 
              className="w-full mt-2" 
              onClick={handleCreate}
              disabled={createNews.isPending || !title || !content}
              data-testid="button-create-news"
            >
              {createNews.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 ml-2" />}
              نشر الخبر
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-2 space-y-4">
        {isLoading ? (
          <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : news && news.length > 0 ? (
          news.map((article) => (
            <Card key={article.id} className="overflow-hidden bg-card/50">
              <CardHeader className="pb-2 border-b bg-muted/10">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg leading-relaxed">{article.title}</CardTitle>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 w-8"
                    onClick={() => handleDelete(article.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  {format(new Date(article.createdAt), 'yyyy/MM/dd HH:mm')}
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <p className="text-sm text-foreground/80 whitespace-pre-wrap">{article.content}</p>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="border-dashed bg-muted/10">
            <CardContent className="flex flex-col items-center justify-center min-h-[200px] text-center p-6">
              <div className="p-4 bg-muted rounded-full mb-4">
                <Edit className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-bold mb-1">لا توجد أخبار</h3>
              <p className="text-sm text-muted-foreground">قم بإضافة أول خبر للمنصة من القائمة الجانبية.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
