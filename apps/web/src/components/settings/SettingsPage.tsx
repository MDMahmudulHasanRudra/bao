'use client';

import type { ReactNode } from 'react';
import { withCorrelation } from '@/lib/errors';
import { useUnsavedChanges } from './useUnsavedChanges';

export type SettingsNotice = { ok: boolean; text: string } | null;

/**
 * Shared shell for every /settings category: one header, one loading state,
 * one retryable error, one 403, one success/error notice, one unsaved guard.
 * Pages keep their own state, validation and save action.
 */
export default function SettingsPage({
  title,
  description,
  loading = false,
  error = null,
  onRetry,
  unauthorized = false,
  notice = null,
  dirty = false,
  width = 'narrow',
  action,
  children,
}: {
  title: string;
  description?: string;
  loading?: boolean;
  /** The raw thrown value; the shell owns message and support-ref formatting. */
  error?: unknown;
  onRetry?: () => void;
  unauthorized?: boolean;
  notice?: SettingsNotice;
  dirty?: boolean;
  /** narrow = forms, wide = card grids, full = tables/logs. */
  width?: 'narrow' | 'wide' | 'full';
  action?: ReactNode;
  children?: ReactNode;
}) {
  useUnsavedChanges(dirty);

  const maxW = width === 'full' ? 'max-w-4xl' : width === 'wide' ? 'max-w-3xl' : 'max-w-xl';

  return (
    <div className={`mx-auto space-y-6 ${maxW}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          {description && <p className="text-sm text-slate-500">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
              Unsaved changes
            </span>
          )}
          {action}
        </div>
      </div>

      {unauthorized ? (
        <div
          role="alert"
          className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700"
        >
          <p className="font-medium text-slate-900">You do not have access to these settings.</p>
          <p className="mt-1 text-slate-500">
            Ask an organization owner or admin to grant access. No configuration details are
            shown because this page is server-authorized.
          </p>
        </div>
      ) : (
        <>
          {loading && (
            <p role="status" className="text-sm text-slate-500">
              Loading…
            </p>
          )}

          {!loading && error && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-white p-6 text-sm text-slate-700"
            >
              <p>{withCorrelation(error)}</p>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {!loading && !error && (
            <>
              {notice && (
                <p
                  role={notice.ok ? 'status' : 'alert'}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    notice.ok
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {notice.text}
                </p>
              )}
              {children}
            </>
          )}
        </>
      )}
    </div>
  );
}
