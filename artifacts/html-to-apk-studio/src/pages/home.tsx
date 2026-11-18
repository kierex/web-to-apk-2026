import { Link } from 'wouter';
import {
  Smartphone,
  Globe,
  Zap,
  Shield,
  MessageCircle,
  Crown,
  ArrowRight,
  Check,
  Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';

const features = [
  {
    icon: Smartphone,
    title: 'Real APK Builds',
    desc: 'Upload HTML/CSS/JS or paste a website URL — get a real, installable Android APK with WebView, splash screen and icons.',
  },
  {
    icon: Globe,
    title: 'Website → APK',
    desc: 'Turn any website into an Android app. We fetch the site, extract assets and wrap it in a native shell.',
  },
  {
    icon: Zap,
    title: 'Fast Builds',
    desc: 'Cloud build pipeline with real-time progress. Download your APK the moment it\'s ready.',
  },
  {
    icon: Shield,
    title: 'Email Verified',
    desc: 'Real SMTP verification on every registration. Your inbox gets a code to activate your account.',
  },
  {
    icon: MessageCircle,
    title: 'World Chat',
    desc: 'Chat with every user on the platform in real time. Admins can broadcast announcements and pop-ups.',
  },
  {
    icon: Crown,
    title: 'Premium Keys',
    desc: 'Hit your free limit? Contact the developer to buy a key — day, week, month, year or lifetime.',
  },
];

const steps = [
  { n: '01', title: 'Create account', desc: 'Register with your email. Verify with the code we send to your inbox.' },
  { n: '02', title: 'Add your app', desc: 'Upload a ZIP of HTML/CSS/JS or paste a website URL. Pick name, icon, theme color.' },
  { n: '03', title: 'Build & download', desc: 'Hit build. Track progress live. Download your signed .apk and install it on any Android.' },
];

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 studio-grid opacity-40" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-transparent to-background" />
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              Real APKs. Real email. Real chat.
            </div>
            <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-6xl">
              Turn any website into an <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">Android app</span> in minutes
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              Webz builds signed, installable APKs from your HTML/CSS/JS or a plain URL.
              No Android Studio. No Java. Just paste, build, download.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href={user ? '/studio' : '/auth/register'}>
                <Button size="lg" className="w-full sm:w-auto">
                  Start building free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <a href="#how">
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  See how it works
                </Button>
              </a>
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500" /> Free tier: 3 builds / day</span>
              <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500" /> Signed APKs</span>
              <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500" /> Email verified accounts</span>
              <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500" /> World chat</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Everything you need to ship an APK</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            One platform for building, verifying, chatting and managing your apps.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="group rounded-xl border border-border bg-card p-6 transition hover:border-primary/40 hover:bg-card/60">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mb-1.5 font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-border bg-muted/20">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Three steps. One APK.</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n} className="relative rounded-xl border border-border bg-background p-6">
                <div className="mb-3 text-4xl font-bold text-primary/30">{s.n}</div>
                <h3 className="mb-1.5 font-semibold">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Simple pricing</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Start free. Upgrade with a key from the developer when you need more.
          </p>
        </div>
        <div className="mx-auto grid max-w-3xl gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-8">
            <h3 className="text-lg font-semibold">Free</h3>
            <div className="mt-2 text-4xl font-bold">
              $0
              <span className="text-base font-normal text-muted-foreground"> / forever</span>
            </div>
            <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
              {['3 builds per day', '1 concurrent build', '50 MB upload limit', 'World chat access', 'Email verified account'].map((i) => (
                <li key={i} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500" /> {i}
                </li>
              ))}
            </ul>
            <Link href="/auth/register" className="mt-8 block">
              <Button variant="outline" className="w-full">Start free</Button>
            </Link>
          </div>
          <div className="relative rounded-xl border border-primary/50 bg-card p-8 ring-1 ring-primary/30">
            <div className="absolute -top-3 right-6 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
              Most popular
            </div>
            <h3 className="text-lg font-semibold">Premium</h3>
            <div className="mt-2 text-4xl font-bold">
              Key
              <span className="text-base font-normal text-muted-foreground"> / from the dev</span>
            </div>
            <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
              {['Unlimited builds', '3 concurrent builds', '500 MB upload limit', 'Priority queue', 'Day / week / month / year / lifetime keys'].map((i) => (
                <li key={i} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" /> {i}
                </li>
              ))}
            </ul>
            <a
              href="https://www.facebook.com/profile.php?id=61594727052834"
              target="_blank"
              rel="noreferrer"
              className="mt-8 block"
            >
              <Button className="w-full">
                Contact developer
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Smartphone className="h-4 w-4" />
              <span>Webz — HTML to APK Studio</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link href="/admin" className="hover:text-foreground">Admin</Link>
              <a
                href="https://www.facebook.com/profile.php?id=61594727052834"
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground"
              >
                Developer
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
