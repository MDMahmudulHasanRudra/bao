'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/errors';
import SettingsPage from '@/components/settings/SettingsPage';

type OrgSettings = {
  companyName?: string;
  industry?: string;
  website?: string;
  timezone?: string;
  currency?: string;
  defaultLeadValue?: number;
  notificationEmail?: string;
};

export default function OrganizationSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<OrgSettings>({});
  const [form, setForm] = useState<OrgSettings>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ settings: OrgSettings }>('/api/v1/settings');
      setSettings(res.settings || {});
      setForm(res.settings || {});
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFlash(null);
    setFieldError(null);
    try {
      const payload: OrgSettings = {};
      if (form.companyName?.trim()) payload.companyName = form.companyName.trim();
      if (form.industry?.trim()) payload.industry = form.industry.trim();
      if (form.website?.trim()) payload.website = form.website.trim();
      if (form.timezone?.trim()) payload.timezone = form.timezone.trim();
      if (form.currency?.trim()) payload.currency = form.currency.trim().toUpperCase();
      if (
        form.defaultLeadValue !== undefined &&
        form.defaultLeadValue !== null &&
        !Number.isNaN(form.defaultLeadValue)
      ) {
        payload.defaultLeadValue = Math.max(0, Math.trunc(form.defaultLeadValue));
      }
      if (form.notificationEmail?.trim()) payload.notificationEmail = form.notificationEmail.trim();

      const res = await api<{ settings: OrgSettings }>('/api/v1/settings', {
        method: 'PUT',
        body: { settings: payload },
      });
      setSettings(res.settings);
      setForm(res.settings);
      flashMsg('Organization settings saved.');
    } catch (err) {
      const msg = errMsg(err);
      setFieldError(msg);
      flashMsg(msg, true);
    } finally {
      setBusy(false);
    }
  }

  function flashMsg(message: string, isError = false) {
    setFlash({ ok: !isError, text: message });
  }

  function set(key: keyof OrgSettings, value: string | number | undefined) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const dirty = Object.keys(form).some(
    (k) => form[k as keyof OrgSettings] !== settings[k as keyof OrgSettings],
  );

  return (
    <SettingsPage
      title="Organization settings"
      description="Known fields only — unknown keys are rejected by the API (validated shape)."
      loading={loading}
      error={error}
      onRetry={() => void load()}
      notice={flash}
      dirty={dirty}
    >
      <form
        onSubmit={(e) => void save(e)}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
      >
        <div>
          <label htmlFor="companyName" className="block text-xs font-medium text-slate-600">
            Company name
          </label>
          <input
            id="companyName"
            value={form.companyName || ''}
            onChange={(e) => set('companyName', e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Acme Inc"
            maxLength={255}
          />
        </div>

        <div>
          <label htmlFor="industry" className="block text-xs font-medium text-slate-600">
            Industry
          </label>
          <input
            id="industry"
            value={form.industry || ''}
            onChange={(e) => set('industry', e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="SaaS"
            maxLength={255}
          />
        </div>

        <div>
          <label htmlFor="website" className="block text-xs font-medium text-slate-600">
            Website
          </label>
          <input
            id="website"
            type="url"
            value={form.website || ''}
            onChange={(e) => set('website', e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="https://example.com"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="timezone" className="block text-xs font-medium text-slate-600">
              Timezone
            </label>
            <input
              id="timezone"
              value={form.timezone || ''}
              onChange={(e) => set('timezone', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="UTC"
              maxLength={64}
            />
          </div>
          <div>
            <label htmlFor="currency" className="block text-xs font-medium text-slate-600">
              Currency
            </label>
            <input
              id="currency"
              value={form.currency || ''}
              onChange={(e) => set('currency', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="USD"
              maxLength={8}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="defaultLeadValue" className="block text-xs font-medium text-slate-600">
              Default lead value ($)
            </label>
            <input
              id="defaultLeadValue"
              type="number"
              min={0}
              step={1}
              value={form.defaultLeadValue ?? ''}
              onChange={(e) =>
                set('defaultLeadValue', e.target.value === '' ? undefined : Number(e.target.value))
              }
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="10000"
            />
          </div>
          <div>
            <label htmlFor="notificationEmail" className="block text-xs font-medium text-slate-600">
              Notification email
            </label>
            <input
              id="notificationEmail"
              type="email"
              value={form.notificationEmail || ''}
              onChange={(e) => set('notificationEmail', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="ops@example.com"
            />
          </div>
        </div>

        {fieldError && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {fieldError}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save settings'}
          </button>
          <p className="text-xs text-slate-500">
            Owner/admin only · last saved keys: {Object.keys(settings).join(', ') || 'none'}
          </p>
        </div>
      </form>
    </SettingsPage>
  );
}
