import Link from 'next/link';
import { SignUpForm } from './SignUpForm';

export const metadata = { title: 'Sign up' };

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ob-bg p-4">
      <div className="w-full max-w-sm rounded-2xl border border-ob-line bg-ob-surface p-8 shadow-card">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-ob-signal/40 bg-ob-signal/10 font-mono text-sm font-bold text-ob-signal">
            OB
          </span>
          <span className="text-sm font-semibold tracking-tight text-ob-ink">Oracle Bot</span>
        </div>
        <h1 className="font-display text-2xl text-ob-ink">Create your account</h1>
        <p className="mt-2 text-sm text-ob-muted">
          Free to start. We&apos;ll create a personal workspace for you on first sign-in.
        </p>
        <div className="mt-6">
          <SignUpForm />
        </div>
        <p className="mt-6 text-center text-xs text-ob-muted">
          Already have an account?{' '}
          <Link href="/sign-in" className="text-ob-signal hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
