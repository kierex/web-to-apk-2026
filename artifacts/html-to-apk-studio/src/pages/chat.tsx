import { type FormEvent, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { Send, MessageCircle, Shield, Crown, Smile, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-context';

const EMOJIS = ['😀', '😂', '😍', '👍', '🔥', '🎉', '🚀', '💻', '📱', '✅', '❤️', '👏', '😎', '🤔', '🙌', '⭐'];

type Msg = {
  id: string;
  userId: string;
  name: string;
  email?: string;
  content: string;
  isAdmin: boolean;
  isPremium: boolean;
  createdAt: number;
  replyTo?: { name: string; content: string };
};

export default function ChatPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [online, setOnline] = useState<number>(1);
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    const socket = io('/', {
      transports: ['websocket', 'polling'],
      auth: {},
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('chat:history', (msgs: Msg[]) => setMessages(msgs || []));
    socket.on('chat:message', (msg: Msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg].slice(-200);
      });
    });
    socket.on('chat:system', (msg: Msg) => {
      setMessages((prev) => [...prev, msg].slice(-200));
    });
    socket.on('chat:online', (count: number) => setOnline(count));
    socket.on('chat:error', (e: { message: string }) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          userId: 'system',
          name: 'System',
          content: e.message,
          isAdmin: false,
          isPremium: false,
          createdAt: Date.now(),
        },
      ]);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if (!content || !socketRef.current) return;
    socketRef.current.emit('chat:message', {
      content,
      replyToId: replyTo?.id,
    });
    setInput('');
    setReplyTo(null);
    setShowEmoji(false);
  }

  function time(ts: number) {
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <MessageCircle className="h-6 w-6 text-primary" /> World Chat
          </h1>
          <p className="text-sm text-muted-foreground">
            {connected ? (
              <span className="text-emerald-500">{online} online</span>
            ) : (
              <span className="text-amber-500">Connecting…</span>
            )}
          </p>
        </div>
      </div>

      <Card className="flex h-[calc(100vh-220px)] min-h-[420px] flex-col">
        <CardHeader className="border-b border-border py-3">
          <CardTitle className="text-sm">Global room — everyone on Webz</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col p-0">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No messages yet. Say hello! 👋
              </div>
            )}
            {messages.map((m) => {
              const own = m.userId === user?.id;
              return (
                <div key={m.id} className={`group flex gap-2.5 ${own ? 'flex-row-reverse' : ''}`}>
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      m.isAdmin ? 'bg-amber-500 text-white' : 'bg-primary/15 text-primary'
                    }`}
                  >
                    {m.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className={`max-w-[75%] ${own ? 'items-end text-right' : ''}`}>
                    <div className="mb-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{m.name}</span>
                      {m.isAdmin && <Shield className="h-3 w-3 text-amber-500" />}
                      {m.isPremium && !m.isAdmin && <Crown className="h-3 w-3 text-amber-500" />}
                      <span>{time(m.createdAt)}</span>
                      {!own && m.userId !== 'system' && (
                        <button
                          className="opacity-0 transition group-hover:opacity-100 hover:text-foreground"
                          onClick={() => setReplyTo(m)}
                          title="Reply"
                        >
                          ↩
                        </button>
                      )}
                    </div>
                    {m.replyTo && (
                      <div className={`mb-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground ${own ? 'text-right' : ''}`}>
                        replying to <b>{m.replyTo.name}</b>: {m.replyTo.content.slice(0, 60)}
                      </div>
                    )}
                    <div
                      className={`inline-block rounded-xl px-3 py-2 text-sm ${
                        m.isAdmin
                          ? 'bg-amber-500/15 text-foreground'
                          : own
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-foreground'
                      }`}
                    >
                      <span className="whitespace-pre-wrap break-words">{m.content}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-border p-3">
            {replyTo && (
              <div className="mb-2 flex items-center justify-between rounded-md bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                <span className="truncate">
                  Replying to <b className="text-foreground">{replyTo.name}</b>
                </span>
                <button onClick={() => setReplyTo(null)} className="hover:text-foreground">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}
            <form onSubmit={send} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowEmoji((s) => !s)}
                className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <Smile className="h-4 w-4" />
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Message the world…"
                className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
                maxLength={500}
              />
              <Button type="submit" size="sm" disabled={!input.trim() || !connected}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
            {showEmoji && (
              <div className="mt-2 flex flex-wrap gap-1">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className="rounded-md p-1 text-lg hover:bg-muted"
                    onClick={() => setInput((v) => v + e)}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
