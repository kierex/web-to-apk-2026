import { type FormEvent, useEffect, useState } from 'react';
import { Crown, KeyRound, Check, X, ExternalLink, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError, formatDate } from '@/lib/api';

export default function PremiumPage() {
  const { user, refresh } = useAuth();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function redeem(e: FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await api.redeemKey(key.trim().toUpperCase());
      setResult({ ok: true, msg: res.message || 'Premium activated!' });
      setKey('');
      refresh();
    } catch (err) {
      setResult({ ok: false, msg: err instanceof ApiError ? err.message : 'Redemption failed.' });
    } finally {
      setBusy(false);
    }
  }

  const isPremium = user?.isPremium;
  const expires = user?.premiumExpiresAt;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Crown className="h-6 w-6 text-amber-500" /> Premium
        </h1>
        <p className="text-sm text-muted-foreground">Unlock unlimited builds and higher limits.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
              <div>
                <div className="text-sm text-muted-foreground">Current plan</div>
                <div className="text-lg font-semibold">{isPremium ? 'Premium' : 'Free'}</div>
              </div>
              {isPremium ? (
                <Badge className="bg-amber-500/20 text-amber-500">
                  {expires ? `Until ${formatDate(expires)}` : 'Lifetime'}
                </Badge>
              ) : (
                <Badge variant="outline">3 builds / day</Badge>
              )}
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                {isPremium ? <Check className="h-4 w-4 text-emerald-500" /> : <X className="h-4 w-4 text-muted-foreground/40" />}
                Unlimited builds
              </li>
              <li className="flex items-center gap-2">
                {isPremium ? <Check className="h-4 w-4 text-emerald-500" /> : <X className="h-4 w-4 text-muted-foreground/40" />}
                3 concurrent builds
              </li>
              <li className="flex items-center gap-2">
                {isPremium ? <Check className="h-4 w-4 text-emerald-500" /> : <X className="h-4 w-4 text-muted-foreground/40" />}
                500 MB upload limit
              </li>
              <li className="flex items-center gap-2">
                {isPremium ? <Check className="h-4 w-4 text-emerald-500" /> : <X className="h-4 w-4 text-muted-foreground/40" />}
                Priority build queue
              </li>
            </ul>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="h-4 w-4 text-primary" /> Redeem a key
              </CardTitle>
              <CardDescription>Paste a key you received from the developer.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={redeem} className="space-y-3">
                {result && (
                  <div
                    className={`rounded-md border px-3 py-2 text-sm ${
                      result.ok
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600'
                        : 'border-destructive/40 bg-destructive/10 text-destructive'
                    }`}
                  >
                    {result.msg}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="key">Premium key</Label>
                  <Input
                    id="key"
                    value={key}
                    onChange={(e) => setKey(e.target.value.toUpperCase())}
                    placeholder="WEBZ-XXXX-XXXX-XXXX"
                    className="font-mono"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy || !key.trim()}>
                  {busy ? 'Redeeming…' : 'Redeem key'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-primary/40 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-base">Need a key?</CardTitle>
              <CardDescription>
                Contact the developer on Facebook. Keys come in day, week, month, year and lifetime.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <a
                href="https://www.facebook.com/profile.php?id=61594727052834"
                target="_blank"
                rel="noreferrer"
                className="block"
              >
                <Button className="w-full">
                  <ExternalLink className="mr-2 h-4 w-4" /> Contact developer
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
