import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Trophy, Newspaper, Archive, ShieldAlert } from "lucide-react";

export default function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "الرئيسية", icon: Trophy },
    { href: "/archive", label: "الأرشيف", icon: Archive },
    { href: "/news", label: "الأخبار", icon: Newspaper },
    { href: "/admin", label: "الإدارة", icon: ShieldAlert },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col" dir="rtl">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl tracking-tight text-white">
              خلية <span className="text-primary">البطولات</span>
            </span>
          </div>
          
          <nav className="hidden md:flex items-center gap-6">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              
              return (
                <Link 
                  key={item.href} 
                  href={item.href}
                  className={`flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                  data-testid={`nav-${item.href.replace("/", "") || "home"}`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8">
        {children}
      </main>
      
      <footer className="border-t border-border/40 bg-background py-6 mt-12">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>جميع الحقوق محفوظة &copy; {new Date().getFullYear()} خلية البطولات.</p>
        </div>
      </footer>
    </div>
  );
}
