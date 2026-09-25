'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

type Integration = {
  id: string;
  name: string;
  description: string;
  configured: boolean;
  detail: string;
  href: string | null;
};

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api<{ integrations: Integration[] }>('/api/v1/settings/integrations');
      setIntegrations(res.integrations || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load integrations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-slate-500">Loading integrations…</p>;
  }

  if (error) {
    return (
      <div className="max-w-xl rounded-xl border border-rose-200 bg-rose-50 p-4">
        <p className="text-sm text-rose-700" role="alert">
          {error}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 cursor-pointer rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition-colors duration-200 hover:bg-rose-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const readyCount = integrations.filter((i) => i.configured).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Integrations</h1>
        <p className="mt-1 text-sm text-slate-500">
          {readyCount} of {integrations.length} configured. Environment keys are set by the
          operator; AI provider keys are managed per workspace.
        </p>
      </div>

      <ul className="space-y-3">
        {integrations.map((int) => (
          <li
            key={int.id}
            className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-slate-900">{int.name}</p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    int.configured
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {int.configured ? 'Connected' : 'Not configured'}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{int.description}</p>
              <p className="mt-0.5 text-xs text-slate-500">{int.detail}</p>
            </div>
            {int.href && (
              <Link
                href={int.href}
                className="shrink-0 cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors duration-200 hover:bg-slate-50"
              >
                Manage
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
