import Link from 'next/link';
import { SignInForm } from './SignInForm';

export const metadata = { title: 'Sign in' };

interface PageProps {
  searchParams: Promise<{ redirect_to?: string }>;
}

export default async function SignInPage({ searchParams }: PageProps) {
  const { redirect_to } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-ob-bg p-4">
      <div className="w-full max-w-sm rounded-2xl border border-ob-line bg-ob-surface p-8 shadow-card">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-ob-signal/40 bg-ob-signal/10 font-mono text-sm font-bold text-ob-signal">
            OB
          </span>
          <span className="text-sm font-semibold tracking-tight text-ob-ink">Oracle Bot</span>
        </div>
        <h1 className="font-display text-2xl text-ob-ink">Sign in</h1>
        <p className="mt-2 text-sm text-ob-muted">
          Welcome back. Use your email and password to continue.
        </p>
        <div className="mt-6">
          <SignInForm redirectTo={redirect_to ?? '/app'} />
        </div>
        <p className="mt-6 text-center text-xs text-ob-muted">
          New to Oracle Bot?{' '}
          <Link href="/sign-up" className="text-ob-signal hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
