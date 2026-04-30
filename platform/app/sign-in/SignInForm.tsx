'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { signIn } from '@/lib/auth-client';

export function SignInForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [devBusy, setDevBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devVisible, setDevVisible] = useState(false);

  // Dev-login button is rendered only when (a) the env flag opts in AND
  // (b) the user is on localhost. Defense in depth — even if the env var
  // leaks to a prod build, the button hides itself off-localhost.
  useEffect(() => {
    const flag = process.env.NEXT_PUBLIC_DEV_BUTTONS === '1';
    const onLocalhost =
      typeof window !== 'undefined' &&
      ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);
    setDevVisible(flag && onLocalhost);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const result = await signIn.email({ email, password, callbackURL: redirectTo });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? 'Sign-in failed.');
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  async function onDevLogin() {
    setError(null);
    setDevBusy(true);
    try {
      const res = await fetch('/api/dev-login', { method: 'POST' });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `dev-login failed (${res.status})`);
      }
      router.push('/app');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDevBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <div className="rounded-lg border border-ob-danger/40 bg-ob-danger/10 p-3 text-xs text-ob-danger">
            {error}
          </div>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      {devVisible && (
        <div className="mt-6 border-t border-ob-line pt-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ob-dim">
            Dev tools
          </p>
          <p className="mt-2 text-xs text-ob-muted">
            One-click sign-in as <span className="font-mono text-ob-ink">dev@oraclebot.local</span>{' '}
            (password <span className="font-mono text-ob-ink">1530</span>). The endpoint refuses
            to run in production.
          </p>
          <Button
            type="button"
            variant="secondary"
            className="mt-3 w-full"
            onClick={onDevLogin}
            disabled={devBusy}
          >
            {devBusy ? 'Logging in…' : 'Dev login'}
          </Button>
        </div>
      )}
    </>
  );
}
