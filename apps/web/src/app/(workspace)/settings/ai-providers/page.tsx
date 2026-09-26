'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { errMsg, isPermissionError } from '@/lib/errors';
import SettingsPage from '@/components/settings/SettingsPage';

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

// D3: `chat_rag` also resolves lead/market research (adapter.ts), so one label
// covers both purposes. No sixth capability was invented.
const CAPABILITY_LABELS: Record<string, string> = {
  chat_rag: 'Chat, RAG & lead research',
  embeddings: 'Embeddings',
  proposal_draft: 'Proposal drafting',
  presentation_brief: 'Presentation brief',
  evaluation: 'Evaluation / Diffy',
};

const capLabel = (cap: string) => CAPABILITY_LABELS[cap] ?? cap;

export default function AiProvidersPage() {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  // Connect wizard: null = closed, '' = open at step 1, otherwise the provider.
  const [connectFor, setConnectFor] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

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
    setError(null);
    setUnauthorized(false);
    try {
      const payload = await api<SettingsPayload>('/api/v1/ai-settings');
      setData(payload);
      const active = payload.providers.find((p) => p.status === 'active');
      setDefaultProvider((prev) => prev || active?.provider || '');
    } catch (err) {
      if (isPermissionError(err)) {
        setUnauthorized(true);
      } else {
        setError(err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeProviders = data?.providers.filter((p) => p.status === 'active') ?? [];
  const def = data?.catalogue.find((c) => c.id === connectFor);
  const currentDefault = data?.defaults.find((d) => d.capability === defaultCap);
  const capsFor = (id: string) =>
    (data?.defaults ?? [])
      .filter((d) => d.provider === id)
      .map((d) => capLabel(d.capability));

  function openWizard(provider?: string) {
    setFormError('');
    setTestResult(null);
    setApiKey('');
    setBaseUrl('');
    setConnectFor(provider ?? '');
    setStep(provider ? 2 : 1);
  }

  function closeWizard() {
    setConnectFor(null);
    setApiKey('');
    setFormError('');
    setTestResult(null);
    setStep(1);
  }

  // Spec 4 step 3: the key must be stored before it can be tested, so this is
  // save-then-test against the existing contract. No new endpoint is invented.
  async function connectProvider(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setTestResult(null);
    setSaving(true);
    try {
      await api('/api/v1/ai-settings', {
        method: 'POST',
        body: { provider: connectFor, apiKey, baseUrl: baseUrl || undefined },
      });
      setApiKey('');
      const payload = await api<SettingsPayload>('/api/v1/ai-settings');
      setData(payload);
      const created = payload.providers.find((p) => p.provider === connectFor);
      if (!created) {
        setTestResult({ ok: false, message: 'Provider saved but not returned by the server.' });
      } else {
        try {
          const res = await api<{ result: { ok: boolean; message: string } }>(
            `/api/v1/ai-settings/${created.id}/test`,
            { method: 'POST' },
          );
          setTestResult({ ok: res.result.ok, message: res.result.message });
          setData(await api<SettingsPayload>('/api/v1/ai-settings'));
        } catch (err) {
          setTestResult({ ok: false, message: errMsg(err) });
        }
      }
      // The provider just connected becomes the default; never blank a good one.
      setDefaultProvider((prev) => connectFor || prev);
      setStep(3);
    } catch (err) {
      setFormError(errMsg(err));
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
      setActionMsg({ id, ok: false, text: errMsg(err) });
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
            setModelsError(errMsg(err));
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
      setDefaultMsg({ ok: false, text: errMsg(err) });
    } finally {
      setSavingDefault(false);
    }
  }

  const empty = !data || data.providers.length === 0;

  return (
    <SettingsPage
      title="AI Providers & Models"
      description="Connect an approved provider. Keys are encrypted on the server and never shown again."
      width="wide"
      loading={loading}
      error={error}
      onRetry={() => void load()}
      unauthorized={unauthorized}
    >
      <div className="space-y-8">
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
            onClick={() => openWizard()}
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
                {capsFor(cat.id).length > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    Selected for: {capsFor(cat.id).join(', ')}
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
                      onClick={() => openWizard(cat.id)}
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

      {/* Spec 4 step 3: connect wizard. Opens on demand, one step at a time. */}
      {connectFor !== null && (
        <section
          id="connect-form"
          className="rounded-xl border border-slate-200 bg-white p-5"
          aria-labelledby="connect-heading"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="connect-heading" className="text-sm font-semibold text-slate-900">
                Connect a provider
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Your key is sent only to this server over TLS, encrypted at rest, and never rendered
                again. Privacy: requests go directly from this server to the provider you choose.
              </p>
            </div>
            <button
              type="button"
              onClick={closeWizard}
              className="shrink-0 cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors duration-200 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>

          <ol className="mt-3 flex flex-wrap gap-2 text-xs">
            {['Choose provider', 'Enter key', 'Test connection', 'Choose models'].map((label, i) => (
              <li
                key={label}
                aria-current={step === i + 1 ? 'step' : undefined}
                className={`rounded-full px-2.5 py-1 ${
                  step === i + 1
                    ? 'bg-indigo-600 text-white'
                    : step > i + 1
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                }`}
              >
                {i + 1}. {label}
              </li>
            ))}
          </ol>

          {step === 1 && (
            <fieldset className="mt-4">
              <legend className="text-xs font-medium text-slate-700">Which provider?</legend>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(data?.catalogue ?? []).map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 transition-colors duration-200 hover:bg-slate-50"
                  >
                    <input
                      type="radio"
                      name="wizard-provider"
                      value={c.id}
                      checked={connectFor === c.id}
                      onChange={() => setConnectFor(c.id)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-sm font-medium text-slate-900">{c.name}</span>
                      <span className="block text-xs text-slate-500">{c.keyHint}</span>
                    </span>
                  </label>
                ))}
              </div>
              <button
                type="button"
                disabled={!connectFor}
                onClick={() => setStep(2)}
                className="mt-4 cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next: enter key
              </button>
            </fieldset>
          )}

          {step === 2 && def && (
            <form onSubmit={(e) => void connectProvider(e)} className="mt-4 space-y-4">
              <p className="text-xs text-slate-500">
                Connecting <strong>{def.name}</strong>. Expected format:{' '}
                <code className="rounded bg-slate-100 px-1">{def.keyHint}</code>
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    placeholder={def.keyHint}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                {def.requireBaseUrl && (
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
              </div>
              {formError && (
                <p className="text-sm text-rose-600" role="alert">
                  {formError}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? 'Saving and testing…' : 'Save and test connection'}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="cursor-pointer rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-200 hover:bg-slate-50"
                >
                  Back
                </button>
              </div>
            </form>
          )}

          {step === 3 && (
            <div className="mt-4 space-y-3">
              {saving ? (
                <p className="text-sm text-slate-500" role="status">
                  Testing connection…
                </p>
              ) : testResult ? (
                <p
                  className={`text-sm ${testResult.ok ? 'text-emerald-700' : 'text-rose-600'}`}
                  role={testResult.ok ? 'status' : 'alert'}
                >
                  {testResult.ok
                    ? `Connected. ${testResult.message}`
                    : `Saved, but the connection test failed: ${testResult.message}`}
                </p>
              ) : null}
              <p className="text-xs text-slate-500">
                The key is now stored encrypted and is never shown again. Next, choose which model
                handles each task.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    closeWizard();
                    document
                      .getElementById('capability-defaults')
                      ?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-indigo-700"
                >
                  Choose models
                </button>
                <button
                  type="button"
                  onClick={closeWizard}
                  className="cursor-pointer rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-200 hover:bg-slate-50"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Capability defaults */}
      {activeProviders.length > 0 && (
        <section
          id="capability-defaults"
          className="rounded-xl border border-slate-200 bg-white p-5"
          aria-labelledby="defaults-heading"
        >
          <h2 id="defaults-heading" className="text-sm font-semibold text-slate-900">
            Default models by capability
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Each business capability resolves to one default model on an enabled provider.
          </p>

          {/* Spec 4 step 3: assigned models, and what happens if one is gone. */}
          <ul className="mt-4 space-y-1.5 text-xs text-slate-700">
            {(data?.capabilities ?? []).map((cap) => {
              const row = (data?.defaults ?? []).find((d) => d.capability === cap);
              const providerActive = row
                ? activeProviders.some((p) => p.provider === row.provider)
                : false;
              return (
                <li key={cap} className="flex flex-wrap gap-x-2">
                  <span className="font-medium">{capLabel(cap)}:</span>
                  {row ? (
                    <span>
                      {row.modelId} · {row.provider}
                      {!providerActive && (
                        <span className="text-amber-700">
                          {' '}
                          — provider is not enabled, so features that need it will show a safe
                          &ldquo;provider not available&rdquo; error instead of sending data
                          anywhere
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-amber-700">
                      not set — features that need it will show a safe &ldquo;no provider
                      configured&rdquo; error and send nothing anywhere
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

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
                    {capLabel(cap)}
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
              No compatible {capLabel(defaultCap)} model on this provider. Try another provider or
              capability.
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
    </SettingsPage>
  );
}
