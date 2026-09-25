'use client';

import { useState, type ReactNode } from 'react';

interface SectionProps {
  title: string;
  subtitle?: string;
  source?: string;
  freshness?: string;
  action?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
}

export function Section({
  title,
  subtitle,
  source,
  freshness,
  action,
  collapsible = false,
  defaultOpen = true,
  className = '',
  children,
  loading = false,
  empty = false,
  emptyTitle = 'No data available',
  emptyDescription = 'Add data to see insights here',
  emptyAction,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (loading) {
    return (
      <div className={`rounded-xl border border-slate-200 bg-white ${className}`}>
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 animate-pulse">
              <div className="h-5 w-24 rounded bg-slate-200" />
              {source && <div className="h-3 w-32 rounded bg-slate-200" />}
            </div>
            {action && <div className="h-8 w-20 rounded bg-slate-200" />}
          </div>
        </div>
        <div className="p-5 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 w-full rounded bg-slate-100 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (empty) {
    return (
      <div className={`rounded-xl border border-dashed border-slate-200 bg-white ${className}`}>
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-slate-900">{title}</h2>
              {source && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                  {source}
                </span>
              )}
            </div>
            {action}
          </div>
        </div>
        <div className="p-8 text-center">
          <svg
            className="mx-auto h-12 w-12 text-slate-300"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M3 3v18h18" />
            <path d="M7 14l4-4 4 4 5-6" />
          </svg>
          <p className="mt-3 text-sm font-medium text-slate-600">{emptyTitle}</p>
          <p className="mt-1 text-sm text-slate-500">{emptyDescription}</p>
          {emptyAction && <div className="mt-4">{emptyAction}</div>}
        </div>
      </div>
    );
  }

  if (collapsible) {
    return (
      <div className={`rounded-xl border border-slate-200 bg-white overflow-hidden ${className}`}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="w-full p-5 flex items-center justify-between border-b border-slate-100 hover:bg-slate-50 transition-colors"
          aria-expanded={open}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <h2 className="font-semibold text-slate-900 truncate">{title}</h2>
            {source && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                {source}
              </span>
            )}
            {freshness && (
              <span className="flex items-center gap-1 text-[11px] text-slate-500">
                <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-500 before:content-[''] before:absolute before:inset-0 before:rounded-full before:bg-emerald-500/30 before:animate-ping" />
                {freshness}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {action}
            <svg
              aria-hidden
              className={`h-4 w-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </button>
        <div
          className={`overflow-hidden transition-all duration-200 ease-out ${open ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}
        >
          <div className="p-5">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-slate-200 bg-white ${className}`}>
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <h2 className="font-semibold text-slate-900 truncate">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
            {source && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                {source}
              </span>
            )}
            {freshness && (
              <span className="flex items-center gap-1 text-[11px] text-slate-500">
                <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-500 before:content-[''] before:absolute before:inset-0 before:rounded-full before:bg-emerald-500/30 before:animate-ping" />
                {freshness}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">{action}</div>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
