import { type ReactNode, useEffect, useState } from 'react';
import { Router as WouterRouter, Route, Redirect, useLocation, Link } from 'wouter';
import { Smartphone, LogOut, Loader2 } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/pages/not-found';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import Home from '@/pages/home';
import AuthPage from '@/pages/auth';
import { DashboardShell } from '@/components/dashboard-shell';
import Studio from '@/pages/studio';
import HistoryPage from '@/pages/history';
import ChatPage from '@/pages/chat';
import PremiumPage from '@/pages/premium';
import ProfilePage from '@/pages/profile';
import AdminPage from '@/pages/admin';

const basePath = (import.meta as any).env?.BASE_PATH || '/';
function stripBase(path: string) {
  return basePath !== '/' && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const queryClient = new QueryClient();

function Mark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Smartphone className="h-4 w-4" />
      </span>
      {!compact && <span>Webz Studio</span>}
    </Link>
  );
}

function PublicNav() {
  const { user, logout } = useAuth();
  const [path] = useLocation();
  const current = stripBase(path);
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Mark />
        <nav className="flex items-center gap-2">
          {user ? (
            <>
              <Link href="/studio" className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted">
                Studio
              </Link>
              <Link href="/history" className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted">
                History
              </Link>
              <button
                onClick={() => logout()}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/auth/login" className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted">
                Sign in
              </Link>
              <Link
                href="/auth/register"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Get started
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">{label}</p>
      </div>
    </div>
  );
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [path] = useLocation();
  if (loading) return <LoadingScreen label="Checking your session…" />;
  if (!user) return <Redirect to={`/auth/login?next=${encodeURIComponent(stripBase(path))}`} />;
  if (!user.isEmailVerified) return <Redirect to="/auth/verify" />;
  return <DashboardShell>{children}</DashboardShell>;
}

function HomeRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user && user.isEmailVerified) return <Redirect to="/studio" />;
  return <Home />;
}

function AuthRoute({ mode }: { mode: 'login' | 'register' | 'verify' | 'forgot' }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user && user.isEmailVerified && mode !== 'verify') return <Redirect to="/studio" />;
  return <AuthPage initialMode={mode} />;
}

function RouterViews() {
  return (
    <>
      <Route path="/">
        <HomeRoute />
      </Route>
      <Route path="/auth/login">
        <AuthRoute mode="login" />
      </Route>
      <Route path="/auth/register">
        <AuthRoute mode="register" />
      </Route>
      <Route path="/auth/verify">
        <AuthRoute mode="verify" />
      </Route>
      <Route path="/auth/forgot">
        <AuthRoute mode="forgot" />
      </Route>
      <Route path="/studio">
        <Protected>
          <Studio />
        </Protected>
      </Route>
      <Route path="/history">
        <Protected>
          <HistoryPage />
        </Protected>
      </Route>
      <Route path="/chat">
        <Protected>
          <ChatPage />
        </Protected>
      </Route>
      <Route path="/premium">
        <Protected>
          <PremiumPage />
        </Protected>
      </Route>
      <Route path="/profile">
        <Protected>
          <ProfilePage />
        </Protected>
      </Route>
      <Route path="/admin">
        <Protected>
          <AdminPage />
        </Protected>
      </Route>
      <Route>
        <NotFound />
      </Route>
    </>
  );
}

function AppFrame() {
  const [path] = useLocation();
  const current = stripBase(path);
  const isPublic = current === '/' || current.startsWith('/auth');
  return (
    <>
      {isPublic && <PublicNav />}
      <WouterRouter base={basePath === '/' ? '' : basePath}>
        <RouterViews />
      </WouterRouter>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ErrorBoundary>
          <AppFrame />
        </ErrorBoundary>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
