'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  api,
  clearSession,
  getMemberships,
  getOrgId,
  getUser,
  switchOrg,
  USER_UPDATED_EVENT,
  type Membership,
  type SessionUser,
} from '@/lib/api';

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
  'lead-intelligence': ['M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2', 'M9 11a4 4 0 100-8 4 4 0 000 8', 'M22 21v-2a4 4 0 00-3-3.87', 'M16 3.13a4 4 0 010 7.75'],
  analytics: ['M3 3v18h18', 'M7 14l4-4 4 4 5-6'],
  'revenue-analytics': ['M3 3v18h18', 'M7 14l4-4 4 4 5-6', 'M12 8v8M8 12h8'],
  automation: ['M9 12l2 2 4-4', 'M12 2v20M2 12h20'],
  billing: [
    'M21 12V7H5a2 2 0 010-4h14v4',
    'M3 11.5V18a2 2 0 002 2h14',
    'M15 11.5h3.5a1.5 1.5 0 010 3H15',
  ],
  'agent-marketplace': ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M12 14v4M12 8v4'],
  accounting: [
    'M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
    'M4 19.5A2.5 2.5 0 016.5 17H20',
    'M4 19.5A2.5 2.5 0 006.5 22H20V2H6.5A2.5 2.5 0 004 4.5v15z',
  ],
  'workflow-builder': ['M4 4v16M20 4v16M4 12h16M20 4v16M4 4v16'],
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
  { href: '/automation', label: 'Automation', moduleId: 'automation' },
  { href: '/agent-marketplace', label: 'Agent Marketplace', moduleId: 'agent-marketplace' },
  { href: '/revenue-analytics', label: 'Revenue Analytics', moduleId: 'revenue-analytics' },
  { href: '/accounting', label: 'Accounting', moduleId: 'accounting' },
  { href: '/workflow-builder', label: 'Workflow Builder', moduleId: 'workflow-builder' },
  { href: '/notifications', label: 'Notifications', moduleId: 'notifications' },
  { href: '/proposals', label: 'Proposals', moduleId: 'proposals' },
  { href: '/presentations', label: 'Presentations', moduleId: 'presentations' },
  { href: '/intelligence', label: 'Monitoring', moduleId: 'intelligence' },
  { href: '/lead-intelligence', label: 'Lead Intelligence', moduleId: 'lead-intelligence' },
  { href: '/analytics', label: 'Analytics', moduleId: 'analytics' },
  { href: '/settings/profile', label: 'My Profile', moduleId: 'settings' },
  { href: '/settings/ai-providers', label: 'AI Providers', moduleId: 'settings' },
  { href: '/settings/integrations', label: 'Integrations', moduleId: 'settings' },
  { href: '/settings/billing', label: 'Billing', moduleId: 'settings' },
  { href: '/settings/members', label: 'Members', moduleId: 'settings' },
  { href: '/settings/organization', label: 'Organization', moduleId: 'settings' },
  { href: '/settings/white-label', label: 'White Label', moduleId: 'settings' },
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [comingSoon, setComingSoon] = useState<{ id: string; name: string }[]>([]);
  const [uiAvailable, setUiAvailable] = useState<Record<string, boolean>>({});
  const [unread, setUnread] = useState(0);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const navRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setNavOpen(false), [pathname]);
  useEffect(() => setMenuOpen(false), [pathname]);

  // A profile save rewrites the cached session user; re-read it so the ribbon updates.
  useEffect(() => {
    const sync = () => setUser(getUser());
    window.addEventListener(USER_UPDATED_EVENT, sync);
    return () => window.removeEventListener(USER_UPDATED_EVENT, sync);
  }, []);

  // Account menu: dismiss on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // The nav scrolls independently, so a deep link like /settings/audit can leave the active
  // item below the fold with no visible selection. Reveal it on every route change.
  useEffect(() => {
    navRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [pathname]);

  // Keyboard dismissal for the mobile drawer.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen]);

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
    const stored = getMemberships();
    if (stored.length) {
      setMemberships(stored);
    } else {
      api<{ memberships: Membership[] }>('/api/v1/identity/me')
        .then((me) => {
          if (me.memberships?.length) {
            setMemberships(me.memberships);
            sessionStorage.setItem('bao_memberships', JSON.stringify(me.memberships));
          }
        })
        .catch(() => undefined);
    }
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
    <div className="flex h-dvh overflow-hidden bg-slate-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-indigo-700 focus:shadow-lg"
      >
        Skip to main content
      </a>
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
        } fixed inset-y-0 left-0 z-40 w-60 shrink-0 flex-col bg-[#0b1220] text-slate-200 md:static md:flex md:min-h-0`}
      >
        <div className="flex shrink-0 items-center gap-2 px-4 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white">
            B
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">Business AI OS</p>
            <p className="truncate text-[11px] text-slate-400">Powered by AI</p>
          </div>
        </div>

        <div className="mx-3 mb-4 shrink-0 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2">
          {memberships.length > 1 ? (
            <>
              <label htmlFor="org-switcher" className="sr-only">
                Switch workspace
              </label>
              <select
                id="org-switcher"
                value={getOrgId() || ''}
                onChange={(e) => {
                  const m = memberships.find((x) => x.organizationId === e.target.value);
                  if (m && m.organizationId !== getOrgId()) {
                    switchOrg(m.organizationId, m.orgName);
                  }
                }}
                className="w-full cursor-pointer truncate rounded bg-transparent text-xs font-medium text-white outline-none"
              >
                {memberships.map((m) => (
                  <option
                    key={m.organizationId}
                    value={m.organizationId}
                    className="text-slate-900"
                  >
                    {m.orgName}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400">Switch workspace</p>
            </>
          ) : (
            <>
              <p className="truncate text-xs font-medium text-white">{orgName}</p>
              <p className="text-[11px] text-slate-400">Workspace</p>
            </>
          )}
        </div>

        <nav
          ref={navRef}
          className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-2"
          aria-label="Primary"
        >
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

        <div className="shrink-0 px-4 pb-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Coming Soon
          </p>
          <ul className="space-y-1.5 text-xs text-slate-400">
            {comingSoon.length === 0 && <li className="text-slate-400">Nothing announced yet</li>}
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

        <div className="shrink-0 border-t border-slate-800 p-3 text-[11px] text-slate-400">
          Business AI OS · v1.0.0
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
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
            <span className="sr-only text-sm text-slate-500 sm:not-sr-only sm:inline">
              {user?.username}
            </span>
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Account menu"
                title={user?.name || 'Account'}
                className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 ring-indigo-200 transition hover:ring-2 focus:outline-none focus-visible:ring-2"
              >
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  (user?.name || user?.username || '?').slice(0, 1).toUpperCase()
                )}
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
                >
                  <div className="border-b border-slate-100 px-3 py-2.5">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {user?.name || 'Account'}
                    </p>
                    <p className="truncate text-xs text-slate-500">{user?.username}</p>
                  </div>
                  <Link
                    href="/settings/profile"
                    role="menuitem"
                    className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Profile settings
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      clearSession();
                      router.replace('/login');
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
