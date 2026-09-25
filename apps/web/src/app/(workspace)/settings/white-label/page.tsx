'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

const FONTS = [
  {
    value: 'system',
    label: 'System UI',
    stack: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
  },
  { value: 'inter', label: 'Inter', stack: "'Inter', ui-sans-serif, system-ui, sans-serif" },
  { value: 'georgia', label: 'Georgia', stack: "Georgia, 'Times New Roman', serif" },
  {
    value: 'helvetica',
    label: 'Helvetica',
    stack: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  { value: 'roboto', label: 'Roboto', stack: "'Roboto', ui-sans-serif, system-ui, sans-serif" },
  { value: 'mono', label: 'Monospace', stack: "ui-monospace, 'SFMono-Regular', Menlo, monospace" },
];

const DEFAULTS = {
  productName: 'Business AI OS',
  tagline: 'Smarter Business. Powered by AI.',
  primaryColor: '#4f46e5',
  secondaryColor: '#7c3aed',
};

type Form = {
  productName: string;
  tagline: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  customDomain: string;
  emailFromName: string;
  emailReplyTo: string;
  termsUrl: string;
  privacyUrl: string;
};

const EMPTY: Form = {
  productName: '',
  tagline: '',
  primaryColor: DEFAULTS.primaryColor,
  secondaryColor: DEFAULTS.secondaryColor,
  fontFamily: 'system',
  customDomain: '',
  emailFromName: '',
  emailReplyTo: '',
  termsUrl: '',
  privacyUrl: '',
};

type Assets = {
  logoUrl: string | null;
  faviconUrl: string | null;
  loginBackgroundUrl: string | null;
};
const NO_ASSETS: Assets = { logoUrl: null, faviconUrl: null, loginBackgroundUrl: null };

type AssetType = 'logo' | 'favicon' | 'loginBackground';

const assetKey = (type: AssetType): keyof Assets =>
  type === 'logo' ? 'logoUrl' : type === 'favicon' ? 'faviconUrl' : 'loginBackgroundUrl';

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : 'Request failed';
}

function fontStack(value: string) {
  return FONTS.find((f) => f.value === value)?.stack ?? FONTS[0].stack;
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

const input =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200';
const label = 'block text-sm font-medium text-slate-700';

export default function WhiteLabelSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [assets, setAssets] = useState<Assets>(NO_ASSETS);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ settings: Record<string, string | null> | null; assets: Assets }>(
        '/api/v1/settings/white-label',
      );
      setAssets({ ...NO_ASSETS, ...(res.assets ?? NO_ASSETS) });
      const s = res.settings ?? {};
      setForm({
        productName: s.productName ?? '',
        tagline: s.tagline ?? '',
        primaryColor: s.primaryColor || DEFAULTS.primaryColor,
        secondaryColor: s.secondaryColor || DEFAULTS.secondaryColor,
        fontFamily: s.fontFamily || 'system',
        customDomain: s.customDomain ?? '',
        emailFromName: s.emailFromName ?? '',
        emailReplyTo: s.emailReplyTo ?? '',
        termsUrl: s.termsUrl ?? '',
        privacyUrl: s.privacyUrl ?? '',
      });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setFlash(null);
    setFieldError(null);
    try {
      await api('/api/v1/settings/white-label', { method: 'PUT', body: form });
      setFlash({ ok: true, text: 'Branding saved' });
      await load();
    } catch (err) {
      setFieldError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function upload(type: AssetType, file: File) {
    setUploading(type);
    setFlash(null);
    setFieldError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await api<{ url: string }>(`/api/v1/settings/white-label/assets/${type}`, {
        method: 'POST',
        body,
      });
      setAssets((a) => ({ ...a, [assetKey(type)]: res.url }));
      setFlash({ ok: true, text: `${type} uploaded` });
    } catch (err) {
      setFieldError(errMsg(err));
    } finally {
      setUploading(null);
    }
  }

  async function removeAsset(type: AssetType) {
    setUploading(type);
    setFlash(null);
    setFieldError(null);
    try {
      await api(`/api/v1/settings/white-label/assets/${type}`, { method: 'DELETE' });
      setAssets((a) => ({ ...a, [assetKey(type)]: null }));
      setFlash({ ok: true, text: `${type} removed` });
    } catch (err) {
      setFieldError(errMsg(err));
    } finally {
      setUploading(null);
    }
  }

  // Preview renders unsaved form state so the operator sees the effect before saving.
  const productName = form.productName.trim() || DEFAULTS.productName;
  const tagline = form.tagline.trim();
  const primary = form.primaryColor || DEFAULTS.primaryColor;
  const gradient = `linear-gradient(135deg, ${primary}, ${form.secondaryColor || DEFAULTS.secondaryColor})`;

  if (loading) return <p className="p-8 text-sm text-slate-500">Loading white label settings…</p>;
  if (error) {
    return (
      <div className="p-8">
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      </div>
    );
  }

  const assetRow = (
    type: 'logo' | 'favicon' | 'loginBackground',
    title: string,
    hint: string,
    current: string | null,
  ) => (
    <div className="flex flex-wrap items-center gap-3">
      {current ? (
        <img
          src={current}
          alt=""
          className="h-12 w-12 rounded-lg border border-slate-200 bg-white object-contain p-1"
        />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400">
          None
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-700">{title}</p>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
      <input
        ref={(el) => {
          fileInputs.current[type] = el;
        }}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(type, file);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        disabled={uploading === type}
        onClick={() => fileInputs.current[type]?.click()}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {uploading === type ? 'Uploading…' : current ? 'Replace' : 'Upload'}
      </button>
      {current && (
        <button
          type="button"
          disabled={uploading === type}
          onClick={() => void removeAsset(type)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Remove
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">White Label</h1>
          <p className="mt-1 text-sm text-slate-500">
            Rebrand the login page and outbound email identity for your workspace.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </header>

      {flash && (
        <p role="status" className={flash.ok ? 'text-sm text-emerald-600' : 'text-sm text-red-600'}>
          {flash.text}
        </p>
      )}
      {fieldError && (
        <p role="alert" className="text-sm text-red-600">
          {fieldError}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Section title="Brand" hint="Shown on the login page for visitors on your custom domain.">
            <div>
              <label htmlFor="productName" className={label}>
                Product name
              </label>
              <input
                id="productName"
                className={`mt-1 ${input}`}
                maxLength={120}
                value={form.productName}
                placeholder={DEFAULTS.productName}
                onChange={(e) => set('productName', e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="tagline" className={label}>
                Tagline
              </label>
              <input
                id="tagline"
                className={`mt-1 ${input}`}
                maxLength={200}
                value={form.tagline}
                placeholder={DEFAULTS.tagline}
                onChange={(e) => set('tagline', e.target.value)}
              />
            </div>
          </Section>

          <Section
            title="Assets"
            hint="PNG, JPEG, WebP or SVG. Logo 2MB, favicon 512KB, background 5MB."
          >
            {assetRow('logo', 'Logo', 'Top-left mark on the login page', assets.logoUrl)}
            {assetRow('favicon', 'Favicon', 'Browser tab icon', assets.faviconUrl)}
            {assetRow(
              'loginBackground',
              'Login background',
              'Full-bleed backdrop image',
              assets.loginBackgroundUrl,
            )}
          </Section>

          <Section
            title="Colours & typography"
            hint="Applied to the login page gradient, buttons and headings."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="primaryColor" className={label}>
                  Primary colour
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    id="primaryColor"
                    type="color"
                    value={form.primaryColor}
                    onChange={(e) => set('primaryColor', e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded border border-slate-300"
                  />
                  <input
                    className={input}
                    value={form.primaryColor}
                    onChange={(e) => set('primaryColor', e.target.value)}
                    aria-label="Primary colour hex"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="secondaryColor" className={label}>
                  Secondary colour
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    id="secondaryColor"
                    type="color"
                    value={form.secondaryColor}
                    onChange={(e) => set('secondaryColor', e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded border border-slate-300"
                  />
                  <input
                    className={input}
                    value={form.secondaryColor}
                    onChange={(e) => set('secondaryColor', e.target.value)}
                    aria-label="Secondary colour hex"
                  />
                </div>
              </div>
            </div>
            <div>
              <label htmlFor="fontFamily" className={label}>
                Font family
              </label>
              <select
                id="fontFamily"
                className={`mt-1 ${input}`}
                value={form.fontFamily}
                onChange={(e) => set('fontFamily', e.target.value)}
              >
                {FONTS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </Section>
        </div>

        <div className="space-y-6">
          <Section
            title="Custom domain"
            hint="Point DNS at this deployment, then request an SSL certificate."
          >
            <div>
              <label htmlFor="customDomain" className={label}>
                Domain
              </label>
              <input
                id="customDomain"
                className={`mt-1 ${input}`}
                placeholder="app.acme.com"
                value={form.customDomain}
                onChange={(e) => set('customDomain', e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-500">
                Bare hostname only — no scheme, path or port. Leave blank to use the default domain.
              </p>
            </div>
            {form.customDomain && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700">
                <p className="font-sans text-slate-600">DNS records to create</p>
                <p className="mt-1">CNAME app → &lt;deployment-host&gt;</p>
                <p className="mt-2 font-sans text-slate-600">
                  SSL provisioning is currently manual.
                </p>
              </div>
            )}
          </Section>

          <Section
            title="Email identity"
            hint="Recorded for your brand. Not yet applied to outbound mail."
          >
            <div>
              <label htmlFor="emailFromName" className={label}>
                From name
              </label>
              <input
                id="emailFromName"
                className={`mt-1 ${input}`}
                maxLength={120}
                value={form.emailFromName}
                onChange={(e) => set('emailFromName', e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="emailReplyTo" className={label}>
                Reply-to
              </label>
              <input
                id="emailReplyTo"
                type="email"
                className={`mt-1 ${input}`}
                value={form.emailReplyTo}
                onChange={(e) => set('emailReplyTo', e.target.value)}
              />
            </div>
          </Section>

          <Section
            title="Legal links"
            hint="Stored for your own site. Not yet linked from the login page."
          >
            <div>
              <label htmlFor="termsUrl" className={label}>
                Terms URL
              </label>
              <input
                id="termsUrl"
                type="url"
                className={`mt-1 ${input}`}
                placeholder="https://acme.com/terms"
                value={form.termsUrl}
                onChange={(e) => set('termsUrl', e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="privacyUrl" className={label}>
                Privacy URL
              </label>
              <input
                id="privacyUrl"
                type="url"
                className={`mt-1 ${input}`}
                placeholder="https://acme.com/privacy"
                value={form.privacyUrl}
                onChange={(e) => set('privacyUrl', e.target.value)}
              />
            </div>
          </Section>
        </div>
      </div>

      <Section
        title="Live preview"
        hint="Renders your unsaved changes as an anonymous visitor would see them."
      >
        <div
          className="flex min-h-64 items-center justify-center rounded-xl p-6"
          style={
            assets.loginBackgroundUrl
              ? {
                  backgroundImage: `url(${assets.loginBackgroundUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
              : { background: 'linear-gradient(135deg, #f8fafc, #eef2ff)' }
          }
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            style={{ fontFamily: fontStack(form.fontFamily) }}
          >
            <div className="mb-5 flex items-center gap-3">
              {assets.logoUrl ? (
                <img src={assets.logoUrl} alt="" className="h-11 w-11 rounded-xl object-contain" />
              ) : (
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold text-white"
                  style={{ background: gradient }}
                >
                  {(productName[0] ?? 'B').toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-slate-900">{productName}</p>
                {tagline && <p className="truncate text-xs text-slate-500">{tagline}</p>}
              </div>
            </div>
            <div className="space-y-3">
              <div className="h-9 rounded-lg border border-slate-200 bg-slate-50" />
              <div className="h-9 rounded-lg border border-slate-200 bg-slate-50" />
              <div
                className="h-9 rounded-lg text-center text-sm font-medium leading-9 text-white"
                style={{ background: gradient }}
              >
                Sign in
              </div>
            </div>
            {(form.termsUrl || form.privacyUrl) && (
              <div className="mt-4 flex justify-center gap-4 text-xs text-slate-500">
                {form.termsUrl && <span>Terms</span>}
                {form.privacyUrl && <span>Privacy</span>}
              </div>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}
