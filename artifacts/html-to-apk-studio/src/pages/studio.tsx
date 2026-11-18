import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react';
import {
  Upload,
  Globe,
  Package,
  Loader2,
  CheckCircle2,
  XCircle,
  Download,
  Zap,
  FileCode,
  Link2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError, formatBytes } from '@/lib/api';

type Mode = 'website' | 'upload';
type BuildState = {
  id: string;
  status: string;
  progress: number;
  log: string;
  error?: string;
  size?: number;
};

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(file);
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export default function Studio() {
  const { user, refresh } = useAuth();
  const [mode, setMode] = useState<Mode>('website');

  // Website mode
  const [websiteUrl, setWebsiteUrl] = useState('');

  // Upload mode (raw files)
  const [htmlFile, setHtmlFile] = useState<File | null>(null);
  const [cssFile, setCssFile] = useState<File | null>(null);
  const [jsFile, setJsFile] = useState<File | null>(null);

  // Common
  const [appName, setAppName] = useState('');
  const [packageName, setPackageName] = useState('com.webz.app');
  const [themeColor, setThemeColor] = useState('#6366f1');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [splashFile, setSplashFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState('');
  const [splashPreview, setSplashPreview] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [build, setBuild] = useState<BuildState | null>(null);
  const [done, setDone] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function onPickFile(file: File | null, kind: 'icon' | 'splash') {
    if (!file) return;
    if (kind === 'icon') {
      setIconFile(file);
      setIconPreview(await readFileAsDataUrl(file));
    } else {
      setSplashFile(file);
      setSplashPreview(await readFileAsDataUrl(file));
    }
  }

  function startPolling(id: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.buildStatus(id);
        setBuild({
          id,
          status: res.status,
          progress: res.progress ?? 0,
          log: res.log || '',
          error: res.error,
          size: res.size,
        });
        if (res.status === 'ready' || res.status === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current);
          setDone(true);
          if (res.status === 'ready') refresh();
        }
      } catch {
        // transient
      }
    }, 2500);
  }

  async function handleBuild(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBuild(null);
    setDone(false);
    if (!appName.trim()) {
      setError('Enter an app name.');
      return;
    }
    setBusy(true);
    try {
      const input: any = {
        name: appName.trim(),
        packageName: packageName.trim() || 'com.webz.app',
        themeColor,
        orientation,
      };
      if (iconPreview) input.iconDataUrl = iconPreview;
      if (splashPreview) input.splashDataUrl = splashPreview;

      if (mode === 'website') {
        if (!websiteUrl.trim()) {
          setError('Enter the website URL.');
          setBusy(false);
          return;
        }
        input.buildMode = 'website';
        input.websiteUrl = websiteUrl.trim();
        input.html = '';
        input.css = '';
        input.javascript = '';
      } else {
        if (!htmlFile) {
          setError('Choose an index.html file.');
          setBusy(false);
          return;
        }
        input.buildMode = 'html';
        input.html = await readFileAsText(htmlFile);
        input.css = cssFile ? await readFileAsText(cssFile) : '';
        input.javascript = jsFile ? await readFileAsText(jsFile) : '';
      }

      const res = await api.createBuild(input);
      if (res.error && res.status === 'failed') {
        setError(res.error);
        setBusy(false);
        return;
      }
      setBuild({ id: res.id, status: res.status, progress: 0, log: res.log || '' });
      startPolling(res.id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        const info = err.data.limit || { used: 0, max: 3 };
        if ((window as any).__webzShowLimit) (window as any).__webzShowLimit(info);
        else setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Build failed to start.');
      }
      setBusy(false);
    }
  }

  const statusLabel: Record<string, string> = {
    queued: 'Queued',
    building: 'Building',
    ready: 'Ready',
    failed: 'Failed',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Build an APK</h1>
        <p className="text-sm text-muted-foreground">
          Paste a website URL or upload HTML/CSS/JS. We build a signed, installable Android APK.
        </p>
      </div>

      <form onSubmit={handleBuild} className="grid gap-6 lg:grid-cols-5">
        {/* Left: source */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">App source</CardTitle>
              <div className="flex gap-1 rounded-lg bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setMode('website')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs transition ${mode === 'website' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
                >
                  <Globe className="h-3.5 w-3.5" /> Website URL
                </button>
                <button
                  type="button"
                  onClick={() => setMode('upload')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs transition ${mode === 'upload' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
                >
                  <Upload className="h-3.5 w-3.5" /> HTML / CSS / JS
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {mode === 'website' ? (
              <div className="space-y-2">
                <Label htmlFor="url">
                  <Link2 className="mr-1 inline h-3.5 w-3.5" />
                  Website URL
                </Label>
                <Input
                  id="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://example.com"
                />
                <p className="text-xs text-muted-foreground">
                  We fetch the site and wrap it in a WebView. Relative assets are kept; external CDNs load live.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <FilePick label="index.html" accept=".html,.htm" file={htmlFile} onChange={(f) => setHtmlFile(f)} required />
                <FilePick label="style.css (optional)" accept=".css" file={cssFile} onChange={(f) => setCssFile(f)} />
                <FilePick label="script.js (optional)" accept=".js" file={jsFile} onChange={(f) => setJsFile(f)} />
              </div>
            )}

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">App name</Label>
                <Input id="name" value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="My App" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pkg">Package name</Label>
                <Input id="pkg" value={packageName} onChange={(e) => setPackageName(e.target.value)} placeholder="com.webz.app" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="theme">Theme color</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="theme"
                    type="color"
                    value={themeColor}
                    onChange={(e) => setThemeColor(e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent"
                  />
                  <Input value={themeColor} onChange={(e) => setThemeColor(e.target.value)} className="w-28 font-mono text-xs" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="orient">Orientation</Label>
                <select
                  id="orient"
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value as any)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </div>
              <FilePick label="App icon (PNG, optional)" accept="image/*" file={iconFile} onChange={(f) => onPickFile(f, 'icon')} preview={iconPreview} />
              <FilePick label="Splash (PNG, optional)" accept="image/*" file={splashFile} onChange={(f) => onPickFile(f, 'splash')} preview={splashPreview} />
            </div>
          </CardContent>
        </Card>

        {/* Right: build + status */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                <Zap className="mr-2 inline h-4 w-4 text-primary" />
                Build
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
              )}
              <Button type="submit" className="w-full" disabled={busy || (build !== null && build.status !== 'failed')}>
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting…
                  </>
                ) : build && build.status === 'ready' ? (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Built
                  </>
                ) : (
                  <>
                    <Package className="mr-2 h-4 w-4" /> Build APK
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                {user?.isPremium ? 'Premium: unlimited builds, 500 MB.' : 'Free: 3 builds/day, 50 MB.'}
              </p>
            </CardContent>
          </Card>

          {build && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span>Status</span>
                  <Badge
                    variant={build.status === 'ready' ? 'default' : build.status === 'failed' ? 'destructive' : 'secondary'}
                  >
                    {statusLabel[build.status] || build.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${build.progress || (build.status === 'ready' ? 100 : 5)}%` }}
                  />
                </div>
                {build.status === 'building' && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {build.progress}% — {build.log || 'Compiling…'}
                  </p>
                )}
                {build.status === 'failed' && build.error && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {build.error}
                  </div>
                )}
                {build.status === 'ready' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      APK ready{build.size ? ` (${formatBytes(build.size)})` : ''}
                    </div>
                    <a href={api.buildDownloadUrl(build.id)}>
                      <Button className="w-full">
                        <Download className="mr-2 h-4 w-4" /> Download APK
                      </Button>
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </form>
    </div>
  );
}

function FilePick({
  label,
  accept,
  file,
  onChange,
  required,
  preview,
}: {
  label: string;
  accept?: string;
  file: File | null;
  onChange: (f: File | null) => void;
  required?: boolean;
  preview?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="flex h-9 flex-1 items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
        >
          <FileCode className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{file ? file.name : 'Choose file'}</span>
        </button>
        {preview && <img src={preview} alt="" className="h-9 w-9 rounded object-cover" />}
      </div>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.files?.[0] || null)}
      />
      {required && !file && <span className="text-[11px] text-destructive">Required</span>}
    </div>
  );
}
