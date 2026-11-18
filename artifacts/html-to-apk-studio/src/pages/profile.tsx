import { type FormEvent, useEffect, useState } from 'react';
import { User, Mail, KeyRound, LifeBuoy, Check, X, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError, formatDate } from '@/lib/api';

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwResult, setPwResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [supportResult, setSupportResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [supportBusy, setSupportBusy] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);

  useEffect(() => {
    refresh();
    api
      .mySupport()
      .then((res: any) => setRequests(Array.isArray(res) ? res : res.requests || []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function changePw(e: FormEvent) {
    e.preventDefault();
    setPwBusy(true);
    setPwResult(null);
    try {
      await api.changePassword(currentPassword, newPassword);
      setPwResult({ ok: true, msg: 'Password updated.' });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setPwResult({ ok: false, msg: err instanceof ApiError ? err.message : 'Failed to change password.' });
    } finally {
      setPwBusy(false);
    }
  }

  async function submitSupport(e: FormEvent) {
    e.preventDefault();
    setSupportBusy(true);
    setSupportResult(null);
    try {
      const res = await api.createSupport(subject.trim(), message.trim());
      setSupportResult({ ok: true, msg: res.message || 'Request submitted.' });
      setSubject('');
      setMessage('');
      const updated = await api.mySupport();
      setRequests(Array.isArray(updated) ? updated : (updated as any).requests || []);
    } catch (err) {
      setSupportResult({ ok: false, msg: err instanceof ApiError ? err.message : 'Failed to submit.' });
    } finally {
      setSupportBusy(false);
    }
  }

  const statusColor: Record<string, string> = {
    pending: 'text-amber-500',
    resolved: 'text-emerald-500',
    rejected: 'text-destructive',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="text-sm text-muted-foreground">Your account, security and support.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4 text-primary" /> Account
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">{user?.name}</span>
              </div>
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" /> Email
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  {user?.email}
                  {user?.isEmailVerified ? (
                    <Badge className="bg-emerald-500/20 text-emerald-500">Verified</Badge>
                  ) : (
                    <Badge variant="destructive">Unverified</Badge>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Plan</span>
                {user?.isPremium ? (
                  <Badge className="bg-amber-500/20 text-amber-500">
                    {user?.premiumExpiresAt ? `Premium · ${formatDate(user.premiumExpiresAt)}` : 'Premium · Lifetime'}
                  </Badge>
                ) : (
                  <Badge variant="outline">Free</Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Member since</span>
                <span className="font-medium">{formatDate(user?.createdAt)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="h-4 w-4 text-primary" /> Change password
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={changePw} className="space-y-3">
                {pwResult && (
                  <div
                    className={`rounded-md border px-3 py-2 text-sm ${
                      pwResult.ok
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600'
                        : 'border-destructive/40 bg-destructive/10 text-destructive'
                    }`}
                  >
                    {pwResult.msg}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="cur">Current password</Label>
                  <Input id="cur" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new">New password</Label>
                  <Input id="new" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} />
                </div>
                <Button type="submit" className="w-full" disabled={pwBusy}>
                  {pwBusy ? 'Updating…' : 'Update password'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <LifeBuoy className="h-4 w-4 text-primary" /> Support
              </CardTitle>
              <CardDescription>Need help? Send a request to the developer.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitSupport} className="space-y-3">
                {supportResult && (
                  <div
                    className={`rounded-md border px-3 py-2 text-sm ${
                      supportResult.ok
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600'
                        : 'border-destructive/40 bg-destructive/10 text-destructive'
                    }`}
                  >
                    {supportResult.msg}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="subj">Subject</Label>
                  <Input id="subj" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What's the issue?" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="msg">Message</Label>
                  <textarea
                    id="msg"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={supportBusy}>
                  <Send className="mr-1 h-4 w-4" /> {supportBusy ? 'Sending…' : 'Submit request'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {requests.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Your requests</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {requests.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{r.subject}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</div>
                    </div>
                    <span className={`shrink-0 text-xs font-medium ${statusColor[r.status] || 'text-muted-foreground'}`}>
                      {r.status}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
