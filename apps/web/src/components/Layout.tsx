import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { api } from '../lib/api';
import { useMe } from '../lib/me';

export function Layout({ children }: { children: ReactNode }) {
  const me = useMe();

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' });
    location.href = '/login';
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4">
      <header className="flex items-center gap-4 py-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-wide">
          <Snowflake />
          Frosthaven
        </Link>
        <nav className="ml-auto flex items-center gap-3 text-sm text-frost-400">
          {me.role === 'admin' && (
            <Link href="/admin" className="hover:text-frost-100">
              Admin
            </Link>
          )}
          <span className="text-frost-300">{me.displayName}</span>
          <button className="hover:text-frost-100" onClick={logout}>
            Sign out
          </button>
        </nav>
      </header>
      <main className="flex-1 pb-12">{children}</main>
    </div>
  );
}

function Snowflake() {
  return (
    <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden>
      <path d="M16 2v28M4 9l24 14M4 23L28 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-ice-400" />
    </svg>
  );
}
