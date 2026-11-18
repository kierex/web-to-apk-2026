import { type ReactNode, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Smartphone,
  History,
  MessageCircle,
  Crown,
  User,
  LogOut,
  Megaphone,
  X,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';

const nav = [
  { to: '/studio', label: 'Build', icon: Smartphone },
  { to: '/history', label: 'History', icon: History },
  { to: '/chat', label: 'World Chat', icon: MessageCircle },
  { to: '/premium', label: 'Premium', icon: Crown },
  { to: '/profile', label: 'Profile', icon: User },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const { user, logout, refresh } = useAuth();
  const [location] = useLocation();
  const [announce, setAnnounce] = useState<any[]>([]);
  const [showPopup, setShowPopup] = useState<any | null>(null);
  const [showLimit, setShowLimit] = useState(false);
  const [limitInfo, setLimitInfo] = useState<{ used: number; max: number }>({ used: 0, max: 3 });

  // Load announcements once
  useEffect(() => {
    if (!user) return;
    api
      .myAnnouncements()
      .then((res: any) => {
        const list = Array.isArray(res) ? res : res.announcements || [];
        setAnnounce(list);
        const popup = list.find((a: any) => a.isPopup && !a.isRead);
        if (popup) setShowPopup(popup);
      })
      .catch(() => {});
  }, [user]);

  async function dismissPopup() {
    if (showPopup) {
      try {
        await api.markAnnouncementRead(showPopup.id);
      } catch {}
    }
    setShowPopup(null);
  }

  // Expose a global limit trigger for the build page
  useEffect(() => {
    (window as any).__webzShowLimit = (info: { used: number; max: number }) => {
      setLimitInfo(info);
      setShowLimit(true);
    };
    return () => {
      delete (window as any).__webzShowLimit;
    };
  }, []);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Announcement bar */}
      {announce.filter((a: any) => !a.isPopup).length > 0 && (
        <div className="border-b border-amber-500/30 bg-amber-500/10">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 text-sm">
            <Megaphone className="h-4 w-4 shrink-0 text-amber-500" />
            <span className="truncate">{announce.filter((a: any) => !a.isPopup)[0].title}: {announce.filter((a: any) => !a.isPopup)[0].message}</span>
          </div>
        </div>
      )}

      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Smartphone className="h-4 w-4" />
            </span>
            Webz
          </Link>
          <div className="flex items-center gap-2">
            {user.isAdmin ? (
              <Badge variant="secondary" className="gap-1"><Shield className="h-3 w-3" /> Admin</Badge>
            ) : user.isPremium ? (
              <Badge className="gap-1 bg-amber-500/20 text-amber-500"><Crown className="h-3 w-3" /> Premium</Badge>
            ) : (
              <Badge variant="outline">Free</Badge>
            )}
            <span className="hidden text-sm text-muted-foreground sm:inline">{user.name}</span>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6">
        {/* Sidebar */}
        <aside className="hidden w-48 shrink-0 md:block">
          <nav className="space-y-1">
            {nav.map((item) => {
              const active = location === item.to;
              return (
                <Link
                  key={item.to}
                  href={item.to}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                    active ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
            {user.isAdmin && (
              <Link
                href="/admin"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  location === '/admin' ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Shield className="h-4 w-4" />
                Admin
              </Link>
            )}
          </nav>
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-background md:hidden">
        {nav.map((item) => {
          const active = location === item.to;
          return (
            <Link key={item.to} href={item.to} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${active ? 'text-primary' : 'text-muted-foreground'}`}>
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Announcement popup */}
      {showPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={dismissPopup}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">{showPopup.title}</h3>
              </div>
              <button onClick={dismissPopup} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{showPopup.message}</p>
            <Button className="mt-5 w-full" onClick={dismissPopup}>Got it</Button>
          </div>
        </div>
      )}

      {/* Premium limit modal */}
      {showLimit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="mb-3 flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              <h3 className="font-semibold">Free limit reached</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              You've used <span className="font-medium text-foreground">{limitInfo.used} of {limitInfo.max} builds</span> today.
              Contact the developer to purchase a premium key (day, week, month, year or lifetime).
            </p>
            <div className="mt-5 space-y-2">
              <a href="https://www.facebook.com/profile.php?id=61594727052834" target="_blank" rel="noreferrer">
                <Button className="w-full">
                  Contact developer on Facebook
                </Button>
              </a>
              <Link href="/premium" onClick={() => setShowLimit(false)}>
                <Button variant="outline" className="w-full">
                  Redeem a key
                </Button>
              </Link>
              <Button variant="ghost" className="w-full" onClick={() => setShowLimit(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
