import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/auth';
import { institute } from '@/config/institute';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false, nocache: true },
};

/** Reads a session cookie, so it must not be statically rendered. */
export const dynamic = 'force-dynamic';

export default async function AdminLoginPage() {
  // Already signed in? Go straight through.
  if (await getCurrentAdmin()) redirect('/admin');

  return (
    <main
      id="main"
      className="flex min-h-screen items-center justify-center bg-surface px-5 py-12"
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-[20px] font-bold uppercase tracking-[0.01em] text-heading">
            {institute.name}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-accent-text">
            Admin
          </p>
        </div>

        <div className="rounded-md border border-rule bg-paper p-6 shadow-e2">
          <h1 className="font-display text-[22px] font-bold text-heading">
            Sign in
          </h1>
          <p className="mt-1.5 text-small text-muted">
            Manage results, batches, announcements and enquiries.
          </p>

          <div className="mt-6">
            <LoginForm />
          </div>
        </div>

        <p className="mt-6 text-center text-[13px] text-muted">
          Trouble signing in? Contact TradyPerch.
        </p>
      </div>
    </main>
  );
}
