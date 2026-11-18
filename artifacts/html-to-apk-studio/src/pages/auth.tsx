import { type FormEvent, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Smartphone, ArrowLeft, Mail, KeyRound, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';

type Mode = 'login' | 'register' | 'verify' | 'forgot' | 'reset';

export default function AuthPage({ initialMode = 'login' }: { initialMode?: Mode }) {
  const { login, register, verifyEmail, resendVerification, forgotPassword, resetPassword } = useAuth();
  const [, navigate] = useLocation();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
    setNotice('');
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'login') {
        const res = await login(email, password);
        if (res.requiresVerification) {
          setCode('');
          switchMode('verify');
          setNotice('We sent a verification code to ' + email);
        } else {
          navigate('/studio');
        }
      } else if (mode === 'register') {
        const res = await register(email, password, name);
        if (res.requiresVerification) {
          setCode('');
          switchMode('verify');
          setNotice(res.devVerificationCode ? `Dev mode (no SMTP): your code is ${res.devVerificationCode}` : 'We sent a verification code to ' + email);
        } else {
          navigate('/studio');
        }
      } else if (mode === 'verify') {
        await verifyEmail(email, code);
        navigate('/studio');
      } else if (mode === 'forgot') {
        await forgotPassword(email);
        switchMode('reset');
        setNotice('If that email exists, a reset code was sent.');
      } else if (mode === 'reset') {
        await resetPassword(email, code, password);
        setMode('login');
        setNotice('Password updated. Sign in with your new password.');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Smartphone className="h-4 w-4" />
            </span>
            Webz
          </Link>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1 inline h-4 w-4" />
            Home
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {mode === 'login' && 'Sign in'}
              {mode === 'register' && 'Create your account'}
              {mode === 'verify' && 'Verify your email'}
              {mode === 'forgot' && 'Reset password'}
              {mode === 'reset' && 'Enter new password'}
            </CardTitle>
            <CardDescription>
              {mode === 'login' && 'Welcome back. Enter your credentials.'}
              {mode === 'register' && 'A verification code will be sent to your email (real Gmail).'}
              {mode === 'verify' && `We sent a 6-digit code to ${email || 'your email'}.`}
              {mode === 'forgot' && 'Enter your account email and we\'ll send a reset code.'}
              {mode === 'reset' && 'Enter the code from your email and a new password.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {notice && (
                <div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm text-foreground">
                  {notice}
                </div>
              )}
              {error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              {mode === 'register' && (
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
                </div>
              )}

              {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@gmail.com" required />
                </div>
              )}

              {(mode === 'login' || mode === 'register' || mode === 'reset') && (
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
                </div>
              )}

              {(mode === 'verify' || mode === 'reset') && (
                <div className="space-y-2">
                  <Label htmlFor="code">
                    <KeyRound className="mr-1 inline h-3.5 w-3.5" />
                    6-digit code
                  </Label>
                  <Input id="code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" inputMode="numeric" required />
                </div>
              )}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? 'Please wait…' : mode === 'verify' ? 'Verify & continue' : mode === 'forgot' ? 'Send reset code' : mode === 'reset' ? 'Set new password' : mode === 'register' ? 'Create account' : 'Sign in'}
              </Button>
            </form>

            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
              {mode === 'verify' && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                  onClick={async () => {
                    try {
                      await resendVerification(email);
                      setNotice('Code re-sent to ' + email);
                    } catch (err) {
                      setError(err instanceof ApiError ? err.message : 'Could not resend.');
                    }
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Resend code
                </button>
              )}
              <div className="flex items-center justify-between">
                {mode === 'login' ? (
                  <>
                    <button type="button" className="hover:text-foreground" onClick={() => switchMode('forgot')}>
                      Forgot password?
                    </button>
                    <button type="button" className="text-primary hover:underline" onClick={() => switchMode('register')}>
                      Create account
                    </button>
                  </>
                ) : (
                  <button type="button" className="hover:text-foreground" onClick={() => switchMode('login')}>
                    <ArrowLeft className="mr-1 inline h-3.5 w-3.5" />
                    Back to sign in
                  </button>
                )}
              </div>
              {mode === 'login' && (
                <p className="flex items-center gap-1.5 pt-2 text-xs">
                  <Mail className="h-3.5 w-3.5" />
                  Accounts are email-verified. New users must confirm their Gmail.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
