import { useState, useEffect } from "react";
import { ShieldAlert, Lock, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TournamentManager from "@/components/admin/tournament-manager";
import NewsManager from "@/components/admin/news-manager";
import { useToast } from "@/hooks/use-toast";

export default function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    const isAuth = localStorage.getItem("admin_auth") === "true";
    if (isAuth) {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "112233") {
      setIsAuthenticated(true);
      localStorage.setItem("admin_auth", "true");
      toast({
        title: "تم تسجيل الدخول بنجاح",
        description: "مرحباً بك في لوحة التحكم",
      });
    } else {
      toast({
        variant: "destructive",
        title: "خطأ في تسجيل الدخول",
        description: "كلمة المرور غير صحيحة",
      });
      setPassword("");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem("admin_auth");
    setPassword("");
  };

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md border-primary/20 shadow-[0_0_30px_-10px_rgba(0,240,255,0.2)]">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto bg-primary/10 p-4 rounded-full w-fit">
              <Lock className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold">لوحة التحكم</CardTitle>
            <CardDescription>أدخل كلمة المرور للوصول إلى لوحة الإدارة</CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent>
              <Input
                type="password"
                placeholder="كلمة المرور..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="text-center font-mono text-lg bg-muted/50 border-primary/30 focus-visible:ring-primary"
                dir="ltr"
                data-testid="input-admin-password"
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full font-bold" data-testid="button-admin-login">
                دخول
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-destructive/10 rounded-lg">
            <ShieldAlert className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">إدارة المنصة</h1>
          </div>
        </div>
        <Button variant="outline" onClick={handleLogout} className="gap-2" data-testid="button-admin-logout">
          تسجيل الخروج
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      <Tabs defaultValue="tournaments" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md mb-8">
          <TabsTrigger value="tournaments" data-testid="tab-tournaments">إدارة البطولات</TabsTrigger>
          <TabsTrigger value="news" data-testid="tab-news">إدارة الأخبار</TabsTrigger>
        </TabsList>
        
        <TabsContent value="tournaments" className="mt-0">
          <TournamentManager />
        </TabsContent>
        
        <TabsContent value="news" className="mt-0">
          <NewsManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
