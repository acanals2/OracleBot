'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { signUp } from '@/lib/auth-client';

export function SignUpForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const result = await signUp.email({ email, password, name, callbackURL: '/app' });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? 'Sign-up failed.');
      return;
    }
    router.push('/app');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
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
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="text-[11px] text-ob-dim">8+ characters.</p>
      </div>
      {error && (
        <div className="rounded-lg border border-ob-danger/40 bg-ob-danger/10 p-3 text-xs text-ob-danger">
          {error}
        </div>
      )}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
