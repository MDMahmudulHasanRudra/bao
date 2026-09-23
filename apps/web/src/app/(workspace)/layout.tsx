'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { clearSession, getOrgId, getUser, type SessionUser } from '@/lib/api';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '⌂' },
  { href: '/knowledge', label: 'Knowledge Hub', icon: '▤' },
  { href: '/assistant', label: 'AI Assistant', icon: '✦' },
  { href: '/sales', label: 'Sales', icon: '◈' },
  { href: '/proposals', label: 'Proposals', icon: '▣' },
  { href: '/presentations', label: 'Presentations', icon: '▷' },
  { href: '/intelligence', label: 'Monitoring', icon: '◉' },
];

const SOON = ['Advanced CRM', 'Email Automation', 'Team Collaboration', 'More AI Agents'];

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [orgName, setOrgName] = useState('Workspace');

  useEffect(() => {
    const u = getUser();
    if (!u || !getOrgId()) {
      router.replace('/login');
      return;
    }
    setUser(u);
    setReady(true);
    const raw = sessionStorage.getItem('bao_org_name');
    if (raw) setOrgName(raw);
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Loading workspace…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-60 shrink-0 flex-col bg-[#0b1220] text-slate-200">
        <div className="flex items-center gap-2 px-4 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white">
            B
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">Business AI OS</p>
            <p className="truncate text-[11px] text-slate-400">Powered by AI</p>
          </div>
        </div>

        <div className="mx-3 mb-4 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2">
          <p className="truncate text-xs font-medium text-white">{orgName}</p>
          <p className="text-[11px] text-slate-400">Workspace</p>
        </div>

        <nav className="flex-1 space-y-1 px-2" aria-label="Primary">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  active
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <span aria-hidden className="w-4 text-center text-xs opacity-80">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 pb-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Coming Soon
          </p>
          <ul className="space-y-1.5 text-xs text-slate-500">
            {SOON.map((s) => (
              <li key={s} className="flex items-center justify-between gap-2">
                <span className="truncate">{s}</span>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                  Soon
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-slate-800 p-3 text-[11px] text-slate-500">
          Business AI OS · v1.0.0
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-3">
          <p className="text-sm font-medium text-slate-600">
            {NAV.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`))?.label ||
              'Workspace'}
          </p>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">{user?.email}</span>
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700"
              title={user?.name}
            >
              {(user?.name || user?.email || '?').slice(0, 1).toUpperCase()}
            </div>
            <button
              type="button"
              onClick={() => {
                clearSession();
                router.replace('/login');
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Log out
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
