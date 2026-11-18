import { useEffect, useState } from 'react';
import { Download, Package, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, formatBytes, formatDate } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

type Build = any;

export default function HistoryPage() {
  const { refresh } = useAuth();
  const [builds, setBuilds] = useState<Build[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await api.myBuilds();
      setBuilds(res.builds || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load builds.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    ready: 'default',
    building: 'secondary',
    queued: 'outline',
    failed: 'destructive',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Build history</h1>
          <p className="text-sm text-muted-foreground">All your APK builds, newest first.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="mr-1 h-4 w-4" /> Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-16 text-sm text-muted-foreground">Loading builds…</CardContent>
        </Card>
      ) : builds.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Package className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No builds yet. Head to the studio and create your first APK.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {builds.map((b: Build) => (
            <Card key={b.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{b.name}</span>
                    <Badge variant={statusVariant[b.status] || 'outline'}>{b.status}</Badge>
                    {b.buildMode === 'website' && <Badge variant="outline">URL</Badge>}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {formatDate(b.createdAt)} · {b.packageName}
                    {b.websiteUrl ? ` · ${b.websiteUrl}` : ''}
                    {b.size ? ` · ${formatBytes(b.size)}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {b.status === 'ready' && (
                    <a href={api.buildDownloadUrl(b.id)}>
                      <Button size="sm">
                        <Download className="mr-1 h-4 w-4" /> Download
                      </Button>
                    </a>
                  )}
                  {b.status === 'failed' && (
                    <span className="max-w-[200px] truncate text-xs text-destructive" title={b.error || ''}>
                      {b.error || 'Build failed'}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
