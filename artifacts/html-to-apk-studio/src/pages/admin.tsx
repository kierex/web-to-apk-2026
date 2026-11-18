import { type FormEvent, useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Package,
  KeyRound,
  Megaphone,
  LifeBuoy,
  MessageCircle,
  Settings,
  LogOut,
  Shield,
  Crown,
  Trash2,
  Plus,
  Copy,
  Check,
  Ban,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError, formatBytes, formatDate } from '@/lib/api';

type Tab = 'overview' | 'users' | 'builds' | 'keys' | 'announcements' | 'requests' | 'chat' | 'settings';

const tabs: { id: Tab; label: string; icon: any }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'builds', label: 'Builds', icon: Package },
  { id: 'keys', label: 'Keys', icon: KeyRound },
  { id: 'announcements', label: 'Announcements', icon: Megaphone },
  { id: 'requests', label: 'Requests', icon: LifeBuoy },
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function AdminPage() {
  const { adminUser, adminLogout } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');

  if (!adminUser) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Shield className="h-4 w-4" />
            </span>
            Webz Admin
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="hidden sm:inline">{adminUser.email}</span>
            <Button variant="ghost" size="sm" onClick={adminLogout}>
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
        <div className="mx-auto max-w-6xl overflow-x-auto px-4">
          <div className="flex gap-1 pb-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${
                  tab === t.id ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {tab === 'overview' && <Overview />}
        {tab === 'users' && <UsersTab />}
        {tab === 'builds' && <BuildsTab />}
        {tab === 'keys' && <KeysTab />}
        {tab === 'announcements' && <AnnouncementsTab />}
        {tab === 'requests' && <RequestsTab />}
        {tab === 'chat' && <ChatTab />}
        {tab === 'settings' && <SettingsTab />}
      </main>
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: any; icon: any }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Overview() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.adminOverview().then(setData).catch((e) => setError(e.message));
  }, []);
  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Loading />;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total users" value={data.users ?? 0} icon={Users} />
        <StatCard label="Premium users" value={data.premium ?? 0} icon={Crown} />
        <StatCard label="Total builds" value={data.builds ?? 0} icon={Package} />
        <StatCard label="Pending requests" value={data.requests ?? 0} icon={LifeBuoy} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent builds</CardTitle>
        </CardHeader>
        <CardContent>
          {(data.recentBuilds || []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No builds yet.</p>
          ) : (
            <div className="space-y-2">
              {(data.recentBuilds || []).map((b: any) => (
                <div key={b.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">{b.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{b.email} · {formatDate(b.createdAt)}</span>
                  </div>
                  <Badge variant={b.status === 'ready' ? 'default' : b.status === 'failed' ? 'destructive' : 'secondary'}>{b.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  async function load() {
    setError('');
    try {
      const res = await api.adminUsers(q || undefined);
      setUsers(res.users || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users.');
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function patch(id: string, p: any, msg: string) {
    try {
      await api.adminUpdateUser(id, p);
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : msg);
    }
  }

  async function remove(id: string, email: string) {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
    try {
      await api.adminDeleteUser(id);
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Failed to delete user.');
    }
  }

  async function copyEmail(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(email);
      setTimeout(() => setCopied(''), 1500);
    } catch {}
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email…" className="max-w-sm" />
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      {error && <ErrorBox msg={error} />}
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {users.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No users found.</p>}
          {users.map((u) => (
            <div key={u.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{u.name}</span>
                  {u.isAdmin && <Badge className="bg-amber-500/20 text-amber-500">Admin</Badge>}
                  {u.isPremium && !u.isAdmin && <Badge className="bg-amber-500/20 text-amber-500">Premium</Badge>}
                  {u.isBanned && <Badge variant="destructive">Banned</Badge>}
                </div>
                <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => copyEmail(u.email)}>
                  {u.email}
                  {copied === u.email ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                </button>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {u.builds ?? 0} builds · joined {formatDate(u.createdAt)}
                  {u.premiumExpiresAt ? ` · premium until ${formatDate(u.premiumExpiresAt)}` : ''}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                <Button size="sm" variant="outline" onClick={() => patch(u.id, { isBanned: !u.isBanned }, 'Failed')}>
                  <Ban className="mr-1 h-3.5 w-3.5" /> {u.isBanned ? 'Unban' : 'Ban'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => patch(u.id, { isPremium: !u.isPremium, premiumExpiresAt: u.isPremium ? null : null }, 'Failed')}>
                  <Crown className="mr-1 h-3.5 w-3.5" /> {u.isPremium ? 'Revoke' : 'Grant'}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => remove(u.id, u.email)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function BuildsTab() {
  const [builds, setBuilds] = useState<any[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api.adminBuilds().then((res) => setBuilds(res.builds || [])).catch((e) => setError(e.message));
  }, []);
  if (error) return <ErrorBox msg={error} />;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">All builds</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border p-0">
        {builds.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No builds yet.</p>}
        {builds.map((b) => (
          <div key={b.id} className="flex items-center justify-between p-4 text-sm">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{b.name}</span>
                <Badge variant={b.status === 'ready' ? 'default' : b.status === 'failed' ? 'destructive' : 'secondary'}>{b.status}</Badge>
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {b.email} · {formatDate(b.createdAt)}
                {b.size ? ` · ${formatBytes(b.size)}` : ''}
              </div>
            </div>
            {b.status === 'ready' && (
              <a href={api.buildDownloadUrl(b.id)}>
                <Button size="sm" variant="outline">Download</Button>
              </a>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function KeysTab() {
  const [keys, setKeys] = useState<any[]>([]);
  const [duration, setDuration] = useState(30);
  const [desc, setDesc] = useState('');
  const [newKey, setNewKey] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  async function load() {
    try {
      const res = await api.adminKeys();
      setKeys(res.keys || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load keys.');
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNewKey('');
    try {
      const res = await api.adminCreateKey({ durationDays: duration, description: desc.trim() || undefined });
      setNewKey(res.key);
      setDesc('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to create key.');
    }
  }

  async function remove(id: string) {
    if (!confirm('Revoke this key?')) return;
    try {
      await api.adminDeleteKey(id);
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Failed to revoke key.');
    }
  }

  async function copy(k: string) {
    try {
      await navigator.clipboard.writeText(k);
      setCopied(k);
      setTimeout(() => setCopied(''), 1500);
    } catch {}
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4 text-primary" /> Generate key
          </CardTitle>
          <CardDescription>Day, week, month, year or lifetime. Share it with the buyer.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Duration</Label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value={1}>1 day</option>
                <option value={7}>7 days (week)</option>
                <option value={30}>30 days (month)</option>
                <option value={365}>365 days (year)</option>
                <option value={0}>Lifetime</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Sold to John via FB" />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full">Generate</Button>
            </div>
          </form>
          {newKey && (
            <div className="mt-4 flex items-center justify-between rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
              <code className="font-mono text-sm">{newKey}</code>
              <button className="flex items-center gap-1 text-xs text-primary hover:underline" onClick={() => copy(newKey)}>
                {copied === newKey ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy
              </button>
            </div>
          )}
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All keys</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border p-0">
          {keys.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No keys yet.</p>}
          {keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between p-4 text-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <code className="font-mono">{k.key}</code>
                  {k.status === 'used' ? <Badge variant="outline">Used</Badge> : <Badge>Active</Badge>}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {k.description || 'No description'} · {k.durationDays === 0 ? 'Lifetime' : `${k.durationDays} days`}
                  {k.redeemedBy ? ` · redeemed by ${k.redeemedBy}` : ''}
                  {k.expiresAt ? ` · expires ${formatDate(k.expiresAt)}` : ''}
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => copy(k.key)}>
                  {copied === k.key ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(k.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function AnnouncementsTab() {
  const [items, setItems] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [isPopup, setIsPopup] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await api.adminAnnouncements();
      setItems(res.announcements || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load.');
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.adminCreateAnnouncement({ title: title.trim(), message: message.trim(), isPopup });
      setTitle('');
      setMessage('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to create.');
    }
  }

  async function toggleActive(id: string, active: boolean) {
    try {
      await api.adminUpdateAnnouncement(id, { active: !active });
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Failed.');
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this announcement?')) return;
    try {
      await api.adminDeleteAnnouncement(id);
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Failed.');
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-4 w-4 text-primary" /> New announcement
          </CardTitle>
          <CardDescription>Shown to all users in the dashboard bar. Popups appear on next visit.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="space-y-3">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Maintenance tonight" required />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                required
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isPopup} onChange={(e) => setIsPopup(e.target.checked)} className="h-4 w-4 rounded border-border" />
              Show as popup on user's next visit
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit">Publish</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active announcements</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border p-0">
          {items.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No announcements.</p>}
          {items.map((a) => (
            <div key={a.id} className="flex items-center justify-between p-4 text-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{a.title}</span>
                  {a.isPopup && <Badge variant="outline">Popup</Badge>}
                  {!a.active && <Badge variant="destructive">Hidden</Badge>}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{a.message}</p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button size="sm" variant="outline" onClick={() => toggleActive(a.id, a.active)}>
                  {a.active ? 'Hide' : 'Show'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(a.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function RequestsTab() {
  const [requests, setRequests] = useState<any[]>([]);
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await api.adminRequests();
      setRequests(res.requests || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load.');
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function patch(id: string, status: string) {
    try {
      await api.adminUpdateRequest(id, { status });
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Failed.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Support & premium requests</CardTitle>
        <CardDescription>Users who reached their limit or asked for help.</CardDescription>
      </CardHeader>
      {error && <ErrorBox msg={error} />}
      <CardContent className="divide-y divide-border p-0">
        {requests.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No requests.</p>}
        {requests.map((r) => (
          <div key={r.id} className="p-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{r.subject}</span>
                  <Badge variant={r.status === 'pending' ? 'secondary' : r.status === 'resolved' ? 'default' : 'destructive'}>{r.status}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {r.email} · {formatDate(r.createdAt)}
                </p>
              </div>
              {r.status === 'pending' && (
                <div className="flex shrink-0 gap-1.5">
                  <Button size="sm" onClick={() => patch(r.id, 'resolved')}>Resolve</Button>
                  <Button size="sm" variant="outline" onClick={() => patch(r.id, 'rejected')}>Reject</Button>
                </div>
              )}
            </div>
            <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted/40 px-3 py-2 text-sm">{r.message}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ChatTab() {
  const [messages, setMessages] = useState<any[]>([]);
  const [content, setContent] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await api.adminChatMessages();
      setMessages(res.messages || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load.');
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function post(e: FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    try {
      await api.adminPostChatMessage(content.trim());
      setContent('');
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Failed to post.');
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this message for all users?')) return;
    try {
      await api.adminDeleteChatMessage(id);
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Failed.');
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-4 w-4 text-primary" /> Broadcast to world chat
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={post} className="flex gap-2">
            <Input value={content} onChange={(e) => setContent(e.target.value)} placeholder="Message as admin…" className="flex-1" />
            <Button type="submit">Post</Button>
          </form>
        </CardContent>
      </Card>
      {error && <ErrorBox msg={error} />}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent messages</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border p-0">
          {messages.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No messages.</p>}
          {messages.map((m) => (
            <div key={m.id} className="flex items-start justify-between gap-3 p-4 text-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{m.name}</span>
                  {m.isAdmin && <Badge className="bg-amber-500/20 text-amber-500">Admin</Badge>}
                  <span className="text-xs text-muted-foreground">{formatDate(m.createdAt)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words">{m.content}</p>
              </div>
              <Button size="sm" variant="ghost" className="shrink-0" onClick={() => remove(m.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsTab() {
  const [settings, setSettings] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.adminSettings()
      .then((res) => {
        setSettings(res);
        setForm({
          smtpHost: res.smtp?.host || '',
          smtpPort: res.smtp?.port || '587',
          smtpUser: res.smtp?.user || '',
          smtpPass: res.smtp?.pass || '',
          smtpFrom: res.smtp?.from || '',
          appName: res.app?.name || 'Webz HTML to APK',
          appUrl: res.app?.url || '',
          freeDailyBuilds: String(res.limits?.freeDailyBuilds ?? 3),
          freeMaxFileSizeMb: String(res.limits?.freeMaxFileSizeMb ?? 50),
          premiumDailyBuilds: String(res.limits?.premiumDailyBuilds ?? 999),
          premiumMaxFileSizeMb: String(res.limits?.premiumMaxFileSizeMb ?? 500),
          maintenanceMode: res.features?.maintenanceMode === true,
          registrationEnabled: res.features?.registrationEnabled !== false,
          emailVerificationRequired: res.features?.emailVerificationRequired !== false,
          contactDeveloperUrl: res.contactDeveloperUrl || '',
          currentPassword: '',
          newPassword: '',
        });
      })
      .catch((e) => setError(e.message));
  }, []);

  function set(k: string, v: any) {
    setForm((f: any) => ({ ...f, [k]: v }));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMsg(null);
    try {
      const payload: any = {
        smtp: {
          host: form.smtpHost,
          port: form.smtpPort,
          user: form.smtpUser,
          pass: form.smtpPass || undefined,
          from: form.smtpFrom,
        },
        app: { name: form.appName, url: form.appUrl },
        limits: {
          freeDailyBuilds: Number(form.freeDailyBuilds),
          freeMaxFileSizeMb: Number(form.freeMaxFileSizeMb),
          premiumDailyBuilds: Number(form.premiumDailyBuilds),
          premiumMaxFileSizeMb: Number(form.premiumMaxFileSizeMb),
        },
        features: {
          maintenanceMode: form.maintenanceMode,
          registrationEnabled: form.registrationEnabled,
          emailVerificationRequired: form.emailVerificationRequired,
        },
        contactDeveloperUrl: form.contactDeveloperUrl,
      };
      if (form.newPassword) {
        payload.changePassword = { currentPassword: form.currentPassword, newPassword: form.newPassword };
      }
      await api.adminUpdateSettings(payload);
      setForm((f: any) => ({ ...f, currentPassword: '', newPassword: '' }));
      setMsg({ ok: true, text: 'Settings saved.' });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to save.');
    }
  }

  if (error) return <ErrorBox msg={error} />;
  if (!settings) return <Loading />;

  return (
    <form onSubmit={save} className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Admin credentials</CardTitle>
          <CardDescription>Current username: {settings.admin?.username}. Change the password below.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Current password</Label>
            <Input type="password" value={form.currentPassword} onChange={(e) => set('currentPassword', e.target.value)} placeholder="required to change" />
          </div>
          <div className="space-y-2">
            <Label>New admin password (min 6)</Label>
            <Input type="password" value={form.newPassword} onChange={(e) => set('newPassword', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">SMTP (email verification)</CardTitle>
          <CardDescription>Gmail: use an App Password. Leave host empty to run in dev mode (codes auto-verify).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>SMTP host</Label>
            <Input value={form.smtpHost} onChange={(e) => set('smtpHost', e.target.value)} placeholder="smtp.gmail.com" />
          </div>
          <div className="space-y-2">
            <Label>Port</Label>
            <Input value={form.smtpPort} onChange={(e) => set('smtpPort', e.target.value)} placeholder="587" />
          </div>
          <div className="space-y-2">
            <Label>SMTP user</Label>
            <Input value={form.smtpUser} onChange={(e) => set('smtpUser', e.target.value)} placeholder="you@gmail.com" />
          </div>
          <div className="space-y-2">
            <Label>SMTP password (app password)</Label>
            <Input type="password" value={form.smtpPass} onChange={(e) => set('smtpPass', e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>From address</Label>
            <Input value={form.smtpFrom} onChange={(e) => set('smtpFrom', e.target.value)} placeholder="Webz <you@gmail.com>" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">App</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>App name</Label>
            <Input value={form.appName} onChange={(e) => set('appName', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>App URL</Label>
            <Input value={form.appUrl} onChange={(e) => set('appUrl', e.target.value)} placeholder="https://yourapp.com" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Limits</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Free builds / day</Label>
            <Input value={form.freeDailyBuilds} onChange={(e) => set('freeDailyBuilds', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Premium builds / day</Label>
            <Input value={form.premiumDailyBuilds} onChange={(e) => set('premiumDailyBuilds', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Free upload limit (MB)</Label>
            <Input value={form.freeMaxFileSizeMb} onChange={(e) => set('freeMaxFileSizeMb', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Premium upload limit (MB)</Label>
            <Input value={form.premiumMaxFileSizeMb} onChange={(e) => set('premiumMaxFileSizeMb', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Features</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.registrationEnabled} onChange={(e) => set('registrationEnabled', e.target.checked)} className="h-4 w-4" />
            Registration enabled
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.emailVerificationRequired} onChange={(e) => set('emailVerificationRequired', e.target.checked)} className="h-4 w-4" />
            Email verification required
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.maintenanceMode} onChange={(e) => set('maintenanceMode', e.target.checked)} className="h-4 w-4" />
            Maintenance mode (blocks builds)
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Developer contact</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label>Contact URL (Facebook / payment)</Label>
          <Input value={form.contactDeveloperUrl} onChange={(e) => set('contactDeveloperUrl', e.target.value)} placeholder="https://www.facebook.com/..." />
        </CardContent>
      </Card>

      {msg && <div className={`rounded-md border px-3 py-2 text-sm ${msg.ok ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600' : 'border-destructive/40 bg-destructive/10 text-destructive'}`}>{msg.text}</div>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit">Save all settings</Button>
    </form>
  );
}

function Loading() {
  return <div className="flex justify-center py-16 text-sm text-muted-foreground">Loading…</div>;
}

function ErrorBox({ msg }: { msg: string }) {
  return <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{msg}</div>;
}
