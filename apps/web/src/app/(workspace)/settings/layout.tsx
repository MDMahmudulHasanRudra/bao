'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { SETTINGS_NAV } from '@/components/workspace-nav';

const GROUPS = SETTINGS_NAV.reduce<string[]>((acc, category) => {
  if (!acc.includes(category.group)) acc.push(category.group);
  return acc;
}, []);

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 md:flex-row md:items-start md:gap-8">
      <nav
        aria-label="Settings"
        className="-mx-1 shrink-0 overflow-x-auto px-1 md:w-52 md:overflow-visible"
      >
        <h2 className="sr-only">Settings sections</h2>
        <ul className="flex gap-1 md:flex-col md:gap-4">
          {GROUPS.map((group) => (
            <li key={group} className="shrink-0 md:shrink">
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {group}
              </p>
              <ul className="flex gap-1 md:flex-col md:gap-0.5">
                {SETTINGS_NAV.filter((c) => c.group === group).map((category) => {
                  const active =
                    pathname === category.href || pathname.startsWith(`${category.href}/`);
                  return (
                    <li key={category.href}>
                      <Link
                        href={category.href}
                        aria-current={active ? 'page' : undefined}
                        className={`block whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors duration-200 md:whitespace-normal ${
                          active
                            ? 'bg-indigo-50 font-medium text-indigo-700'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        {category.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
