'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

type ProviderCard = {
  id: string;
  provider: string;
  label: string | null;
  baseUrl: string | null;
  keySuffix: string;
  status: string;
  lastTestedAt: string | null;
  lastTestResult: string | null;
  lastTestError: string | null;
};

type DefaultRow = { capability: string; provider: string; modelId: string };

type CatalogueEntry = {
  id: string;
  name: string;
  docsUrl: string;
  keyHint: string;
  requireBaseUrl: boolean;
  supportsEmbeddings: boolean;
};

type SettingsPayload = {
  providers: ProviderCard[];
  defaults: DefaultRow[];
  catalogue: CatalogueEntry[];
  capabilities: string[];
};

type ModelOption = { id: string; capabilities: string[] };

const CAPABILITY_LABELS: Record<string, string> = {
  chat_rag: 'Chat / RAG',
  embeddings: 'Embeddings',
  proposal_draft: 'Proposal drafting',
  presentation_brief: 'Presentation brief',
  evaluation: 'Evaluation',
};

function isPermissionError(err: unknown): boolean {
  return err instanceof Error && /Missing permission|Forbidden/i.test(err.message);
}

export default function AiProvidersPage() {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unauthorized, setUnauthorized] = useState(false);

  // Connect form
  const [selected, setSelected] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');

  // Per-action busy + feedback
  const [busyId, setBusyId] = useState('');
  const [actionMsg, setActionMsg] = useState<{ id: string; ok: boolean; text: string } | null>(
    null,
  );

  // Defaults
  const [defaultCap, setDefaultCap] = useState('chat_rag');
  const [defaultProvider, setDefaultProvider] = useState('');
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [savingDefault, setSavingDefault] = useState(false);
  const [defaultMsg, setDefaultMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setUnauthorized(false);
    try {
      const payload = await api<SettingsPayload>('/api/v1/ai-settings');
      setData(payload);
      const active = payload.providers.find((p) => p.status === 'active');
      if (active && !defaultProvider) setDefaultProvider(active.provider);
    } catch (err) {
      if (isPermissionError(err)) {
        setUnauthorized(true);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load AI settings');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeProviders = data?.providers.filter((p) => p.status === 'active') ?? [];
  const def = data?.catalogue.find((c) => c.id === selected);
  const currentDefault = data?.defaults.find((d) => d.capability === defaultCap);

  async function connectProvider(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setSaveSuccess('');
    setSaving(true);
    try {
      await api('/api/v1/ai-settings', {
        method: 'POST',
        body: {
          provider: selected,
          apiKey,
          baseUrl: baseUrl || undefined,
        },
      });
      setApiKey('');
      // Auto-verify after save
      const payload = await api<SettingsPayload>('/api/v1/ai-settings');
      setData(payload);
      const created = payload.providers.find((p) => p.provider === selected);
      if (created) {
        try {
          const testRes = await api<{ result: { ok: boolean; message: string } }>(
            `/api/v1/ai-settings/${created.id}/test`,
            { method: 'POST' },
          );
          const refreshed = await api<SettingsPayload>('/api/v1/ai-settings');
          setData(refreshed);
          setSaveSuccess(
            testRes.result.ok
              ? `Connected and verified: ${testRes.result.message}`
              : `Saved, but verification failed: ${testRes.result.message}`,
          );
        } catch {
          setSaveSuccess('Saved. Run “Test connection” to verify.');
        }
      } else {
        setSaveSuccess('Provider saved.');
      }
      setDefaultProvider(selected);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save provider');
    } finally {
      setSaving(false);
    }
  }

  async function runAction(id: string, action: 'test' | 'revoke' | 'enable' | 'disable') {
    setBusyId(id);
    setActionMsg(null);
    try {
      if (action === 'test') {
        const res = await api<{ result: { ok: boolean; message: string } }>(
          `/api/v1/ai-settings/${id}/test`,
          { method: 'POST' },
        );
        setActionMsg({ id, ok: res.result.ok, text: res.result.message });
      } else if (action === 'revoke') {
        if (!window.confirm('Revoke this provider? The key and its model defaults are deleted.')) {
          setBusyId('');
          return;
        }
        await api(`/api/v1/ai-settings/${id}/revoke`, { method: 'POST' });
        setActionMsg({ id, ok: true, text: 'Provider revoked.' });
      } else {
        await api(`/api/v1/ai-settings/${id}`, {
          method: 'PATCH',
          body: { status: action === 'enable' ? 'active' : 'disabled' },
        });
        setActionMsg({
          id,
          ok: true,
          text: action === 'enable' ? 'Provider enabled.' : 'Provider disabled.',
        });
      }
      setData(await api<SettingsPayload>('/api/v1/ai-settings'));
    } catch (err) {
      setActionMsg({ id, ok: false, text: err instanceof Error ? err.message : 'Action failed' });
    } finally {
      setBusyId('');
    }
  }

  useEffect(() => {
    let cancelled = false;
    setModels([]);
    setDefaultModel('');
    setModelsError('');
    const provider = defaultProvider;
    if (!provider || !data) return;
    setModelsLoading(true);
    (async () => {
      try {
        const res = await api<{ models: ModelOption[]; source: string }>(
          `/api/v1/ai-settings/models?provider=${encodeURIComponent(provider)}&capability=${encodeURIComponent(defaultCap)}`,
        );
        if (!cancelled) {
          setModels(res.models);
          const saved = data.defaults.find((d) => d.capability === defaultCap);
          if (saved && saved.provider === provider) setDefaultModel(saved.modelId);
          else if (res.models[0]) setDefaultModel(res.models[0].id);
        }
      } catch (err) {
        if (!cancelled) {
          setModelsError(err instanceof Error ? err.message : 'Failed to load models');
        }
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [defaultCap, defaultProvider, data]);

  async function saveDefault() {
    setSavingDefault(true);
    setDefaultMsg(null);
    try {
      await api('/api/v1/ai-settings/defaults', {
        method: 'PUT',
        body: { capability: defaultCap, provider: defaultProvider, modelId: defaultModel },
      });
      setDefaultMsg({ ok: true, text: 'Default model saved.' });
      setData(await api<SettingsPayload>('/api/v1/ai-settings'));
    } catch (err) {
      setDefaultMsg({ ok: false, text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSavingDefault(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading AI settings…</p>;
  }

  if (unauthorized) {
    return (
      <div className="max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-lg font-semibold text-amber-900">AI Providers</h1>
        <p className="mt-2 text-sm text-amber-800" role="alert">
          You don’t have permission to view AI provider settings. Ask an owner or admin to update
          them.
        </p>
      </div>
    );
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

  const empty = !data || (data.providers.length === 0 && !selected);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">AI Providers</h1>
        <p className="mt-1 text-sm text-slate-500">
          Connect an approved provider. Keys are encrypted on the server and never shown again.
        </p>
      </div>

      {/* Provider cards */}
      {empty ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-sm font-semibold text-slate-800">No provider connected yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Connect OpenRouter, OpenAI, Gemini, Anthropic, or an approved OpenAI-compatible endpoint
            to enable chat, RAG, and embeddings for your workspace.
          </p>
          <button
            type="button"
            onClick={() => setSelected(selected || 'openai')}
            className="mt-4 cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-indigo-700"
          >
            Connect a provider
          </button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(data?.catalogue ?? []).map((cat) => {
            const row = data?.providers.find((p) => p.provider === cat.id);
            const status = row?.status ?? 'none';
            const badge =
              status === 'active' && row?.lastTestResult === 'failed'
                ? { label: 'Needs attention', cls: 'bg-amber-100 text-amber-800' }
                : status === 'active'
                  ? { label: 'Connected', cls: 'bg-emerald-100 text-emerald-800' }
                  : status === 'disabled'
                    ? { label: 'Disabled', cls: 'bg-slate-200 text-slate-600' }
                    : { label: 'Not connected', cls: 'bg-slate-100 text-slate-500' };
            return (
              <li
                key={cat.id}
                className="flex flex-col rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{cat.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {row ? `Key ${row.keySuffix}` : cat.keyHint}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}
                  >
                    {badge.label}
                  </span>
                </div>
                {row && (
                  <p className="mt-2 text-xs text-slate-500">
                    {row.lastTestedAt
                      ? `Last test: ${row.lastTestResult ?? '—'} · ${new Date(row.lastTestedAt).toLocaleString()}`
                      : 'Not tested yet'}
                  </p>
                )}
                {actionMsg && row && actionMsg.id === row.id && (
                  <p
                    className={`mt-2 text-xs ${actionMsg.ok ? 'text-emerald-700' : 'text-rose-700'}`}
                    role="alert"
                  >
                    {actionMsg.text}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {!row && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(cat.id);
                        document.getElementById('connect-form')?.scrollIntoView({
                          behavior: 'smooth',
                        });
                      }}
                      className="cursor-pointer rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors duration-200 hover:bg-indigo-700"
                    >
                      Connect
                    </button>
                  )}
                  {row && (
                    <>
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => void runAction(row.id, 'test')}
                        className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors duration-200 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {busyId === row.id ? 'Testing…' : 'Test connection'}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() =>
                          void runAction(row.id, row.status === 'active' ? 'disable' : 'enable')
                        }
                        className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors duration-200 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {row.status === 'active' ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => void runAction(row.id, 'revoke')}
                        className="cursor-pointer rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 transition-colors duration-200 hover:bg-rose-50 disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    </>
                  )}
                  <a
                    href={cat.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="cursor-pointer rounded-lg px-1 py-1.5 text-xs text-indigo-600 underline transition-colors duration-200 hover:text-indigo-800"
                  >
                    Get key
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Connect form */}
      <section
        id="connect-form"
        className="rounded-xl border border-slate-200 bg-white p-5"
        aria-labelledby="connect-heading"
      >
        <h2 id="connect-heading" className="text-sm font-semibold text-slate-900">
          Connect or replace a provider key
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Your key is sent only to this server over TLS, encrypted at rest, and never rendered
          again. Privacy: requests go directly from this server to the provider you choose.
        </p>
        <form onSubmit={(e) => void connectProvider(e)} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="provider" className="block text-xs font-medium text-slate-700">
                Provider
              </label>
              <select
                id="provider"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                required
                className="mt-1 w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Select a provider…</option>
                {(data?.catalogue ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="apikey" className="block text-xs font-medium text-slate-700">
                API key
              </label>
              <input
                id="apikey"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                required
                minLength={8}
                placeholder={def?.keyHint || 'Paste your API key'}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
          {def?.requireBaseUrl && (
            <div>
              <label htmlFor="baseurl" className="block text-xs font-medium text-slate-700">
                Base URL (HTTPS, include /v1)
              </label>
              <input
                id="baseurl"
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                required
                placeholder="https://your-endpoint.example.com/v1"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          )}
          {def && (
            <p className="text-xs text-slate-500">
              Expected format: <code className="rounded bg-slate-100 px-1">{def.keyHint}</code>
            </p>
          )}
          {formError && (
            <p className="text-sm text-rose-600" role="alert">
              {formError}
            </p>
          )}
          {saveSuccess && (
            <p className="text-sm text-emerald-700" role="status">
              {saveSuccess}
            </p>
          )}
          <button
            type="submit"
            disabled={saving || !selected}
            className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving & verifying…' : 'Save & verify'}
          </button>
        </form>
      </section>

      {/* Capability defaults */}
      {activeProviders.length > 0 && (
        <section
          className="rounded-xl border border-slate-200 bg-white p-5"
          aria-labelledby="defaults-heading"
        >
          <h2 id="defaults-heading" className="text-sm font-semibold text-slate-900">
            Default models by capability
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Each business capability resolves to one default model on an enabled provider.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="capability" className="block text-xs font-medium text-slate-700">
                Capability
              </label>
              <select
                id="capability"
                value={defaultCap}
                onChange={(e) => setDefaultCap(e.target.value)}
                className="mt-1 w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {(data?.capabilities ?? []).map((cap) => (
                  <option key={cap} value={cap}>
                    {CAPABILITY_LABELS[cap] ?? cap}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="dprovider" className="block text-xs font-medium text-slate-700">
                Provider
              </label>
              <select
                id="dprovider"
                value={defaultProvider}
                onChange={(e) => setDefaultProvider(e.target.value)}
                className="mt-1 w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {activeProviders.map((p) => (
                  <option key={p.id} value={p.provider}>
                    {p.label || p.provider}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="model" className="block text-xs font-medium text-slate-700">
                Model
              </label>
              <select
                id="model"
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                disabled={modelsLoading}
                className="mt-1 w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
              >
                {modelsLoading && <option>Loading models…</option>}
                {!modelsLoading && models.length === 0 && (
                  <option value="">No compatible model</option>
                )}
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {modelsError && (
            <p className="mt-3 text-sm text-rose-600" role="alert">
              {modelsError}
            </p>
          )}
          {!modelsLoading && models.length === 0 && !modelsError && (
            <p className="mt-3 text-sm text-slate-500">
              No compatible {CAPABILITY_LABELS[defaultCap] ?? defaultCap} model on this provider.
              Try another provider or capability.
            </p>
          )}
          {currentDefault && (
            <p className="mt-3 text-xs text-slate-500">
              Current default: <strong>{currentDefault.modelId}</strong> ({currentDefault.provider})
            </p>
          )}
          {defaultMsg && (
            <p
              className={`mt-3 text-sm ${defaultMsg.ok ? 'text-emerald-700' : 'text-rose-600'}`}
              role={defaultMsg.ok ? 'status' : 'alert'}
            >
              {defaultMsg.text}
            </p>
          )}
          <button
            type="button"
            disabled={savingDefault || !defaultModel}
            onClick={() => void saveDefault()}
            className="mt-4 cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingDefault ? 'Saving…' : 'Save default'}
          </button>
        </section>
      )}
    </div>
  );
}
