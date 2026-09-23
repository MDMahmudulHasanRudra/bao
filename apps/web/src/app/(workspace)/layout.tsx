'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { api, clearSession, getOrgId, getUser, type SessionUser } from '@/lib/api';

const ICONS: Record<string, string[]> = {
  dashboard: ['M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1v-10.5z'],
  knowledge: [
    'M4 19.5A2.5 2.5 0 0 1 6.5 17H20',
    'M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z',
  ],
  'ai-assistant': [
    'm12 3 1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z',
    'M18 15.5 18.7 17.3 20.5 18l-1.8.7L18 20.5l-.7-1.8L15.5 18l1.8-.7.7-1.8z',
  ],
  sales: [
    'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0',
    'M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0',
    'M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
  ],
  notifications: ['M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9', 'M13.73 21a2 2 0 0 1-3.46 0'],
  proposals: [
    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
    'M14 2v6h6',
    'M16 13H8',
    'M16 17H8',
  ],
  presentations: ['M2 3h20v14H2z', 'M8 21h8', 'M12 17v4'],
  intelligence: ['M22 12h-4l-3 9L9 3l-3 9H2'],
  analytics: ['M3 3v18h18', 'M7 14l4-4 4 4 5-6'],
  settings: [
    'M4 21v-7',
    'M4 10V3',
    'M12 21v-9',
    'M12 8V3',
    'M20 21v-5',
    'M20 12V3',
    'M1 14h6',
    'M9 8h6',
    'M17 16h6',
  ],
};

function NavIcon({ id }: { id: string }) {
  const paths = ICONS[id] ?? [];
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0 opacity-80"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

const NAV = [
  { href: '/dashboard', label: 'Dashboard', moduleId: 'dashboard' },
  { href: '/knowledge', label: 'Knowledge Hub', moduleId: 'knowledge' },
  { href: '/assistant', label: 'AI Assistant', moduleId: 'ai-assistant' },
  { href: '/sales', label: 'Sales', moduleId: 'sales' },
  { href: '/notifications', label: 'Notifications', moduleId: 'notifications' },
  { href: '/proposals', label: 'Proposals', moduleId: 'proposals' },
  { href: '/presentations', label: 'Presentations', moduleId: 'presentations' },
  { href: '/intelligence', label: 'Monitoring', moduleId: 'intelligence' },
  { href: '/analytics', label: 'Analytics', moduleId: 'analytics' },
  { href: '/settings/ai-providers', label: 'AI Providers', moduleId: 'settings' },
  { href: '/settings/organization', label: 'Organization', moduleId: 'settings' },
  { href: '/settings/audit', label: 'Audit Log', moduleId: 'settings' },
];

type ModulesPayload = {
  modules: { id: string; name: string; uiAvailable?: boolean }[];
  comingSoon: { id: string; name: string }[];
};

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [orgName, setOrgName] = useState('Workspace');
  const [navOpen, setNavOpen] = useState(false);
  const [comingSoon, setComingSoon] = useState<{ id: string; name: string }[]>([]);
  const [uiAvailable, setUiAvailable] = useState<Record<string, boolean>>({});
  const [unread, setUnread] = useState(0);

  useEffect(() => setNavOpen(false), [pathname]);

  useEffect(() => {
    if (!ready) return;
    api<{ unreadCount: number }>('/api/v1/notifications')
      .then((d) => setUnread(d.unreadCount || 0))
      .catch(() => undefined);
  }, [ready, pathname]);

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

    api<ModulesPayload>('/api/v1/modules')
      .then((data) => {
        setComingSoon(data.comingSoon || []);
        setUiAvailable(
          Object.fromEntries((data.modules || []).map((m) => [m.id, m.uiAvailable !== false])),
        );
      })
      .catch(() => {
        // Fallback: no badges, empty coming-soon — nav still works.
      });
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
      {navOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}
      <aside
        id="workspace-nav"
        className={`${
          navOpen ? 'flex' : 'hidden'
        } fixed inset-y-0 left-0 z-40 w-60 shrink-0 flex-col bg-[#0b1220] text-slate-200 md:static md:flex`}
      >
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
            const noUi = item.moduleId in uiAvailable && !uiAvailable[item.moduleId];
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  active
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <NavIcon id={item.moduleId} />
                <span className="flex-1 truncate">{item.label}</span>
                {item.moduleId === 'notifications' && unread > 0 && (
                  <span
                    className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                    aria-label={`${unread} unread notifications`}
                  >
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
                {noUi && (
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                    Soon
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 pb-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Coming Soon
          </p>
          <ul className="space-y-1.5 text-xs text-slate-500">
            {comingSoon.length === 0 && <li className="text-slate-600">Nothing announced yet</li>}
            {comingSoon.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2">
                <span className="truncate">{s.name}</span>
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
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Open navigation"
              aria-expanded={navOpen}
              aria-controls="workspace-nav"
              onClick={() => setNavOpen(true)}
              className="cursor-pointer rounded-lg border border-slate-200 p-1.5 text-slate-600 transition-colors duration-200 hover:bg-slate-50 md:hidden"
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                className="h-5 w-5"
              >
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <p className="truncate text-sm font-medium text-slate-600">
              {NAV.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`))?.label ||
                'Workspace'}
            </p>
          </div>
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
        <main className="min-w-0 flex-1 overflow-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
