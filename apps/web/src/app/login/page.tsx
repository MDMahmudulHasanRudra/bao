'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { api, login } from '@/lib/api';

type Branding = {
  productName: string | null;
  tagline: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  loginBackgroundUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  fontFamily: string | null;
};

const FONT_STACKS: Record<string, string> = {
  system: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
  inter: "'Inter', ui-sans-serif, system-ui, sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  helvetica: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  roboto: "'Roboto', ui-sans-serif, system-ui, sans-serif",
  mono: "ui-monospace, 'SFMono-Regular', Menlo, monospace",
};

const DEFAULT_NAME = 'Business AI OS';
const DEFAULT_TAGLINE = 'Smarter Business. Powered by AI.';
const DEFAULT_PRIMARY = '#4f46e5';
const DEFAULT_SECONDARY = '#7c3aed';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('demo');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [branding, setBranding] = useState<Branding | null>(null);

  // Public endpoint: resolves this org from the Host header on a white-labelled domain.
  // Any failure just leaves the default product branding in place.
  useEffect(() => {
    let cancelled = false;
    void api<{ branding: Branding }>('/api/v1/branding', { auth: false })
      .then((res) => {
        if (!cancelled && res.branding) setBranding(res.branding);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!branding?.faviconUrl) return;
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = branding.faviconUrl;
    document.head.appendChild(link);
    return () => {
      link.remove();
    };
  }, [branding?.faviconUrl]);

  const productName = branding?.productName?.trim() || DEFAULT_NAME;
  const tagline = branding?.tagline?.trim() || DEFAULT_TAGLINE;
  const primary = branding?.primaryColor || DEFAULT_PRIMARY;
  const secondary = branding?.secondaryColor || DEFAULT_SECONDARY;
  const fontFamily = FONT_STACKS[branding?.fontFamily ?? 'system'] ?? FONT_STACKS.system;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError('');
    setPending(true);
    try {
      await login(username.trim(), password);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setPending(false);
    }
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center px-4"
      style={
        branding?.loginBackgroundUrl
          ? {
              backgroundImage: `url(${branding.loginBackgroundUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : { background: 'linear-gradient(135deg, #f8fafc, #eef2ff)' }
      }
    >
      <div className="w-full max-w-md" style={{ fontFamily }}>
        <div className="mb-8 flex items-center gap-3">
          {branding?.logoUrl ? (
            <img src={branding.logoUrl} alt="" className="h-11 w-11 object-contain" />
          ) : (
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold text-white"
              style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
            >
              {(productName[0] ?? 'B').toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-lg font-semibold text-slate-900">{productName}</p>
            <p className="text-sm text-slate-500">{tagline}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">Use your workspace account to continue.</p>

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-slate-700">
                Username
              </label>
              <input
                id="username"
                type="text"
                required
                minLength={3}
                maxLength={32}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </div>

            {error ? (
              <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={pending}
              style={{ backgroundColor: primary }}
              className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white hover:brightness-95 disabled:opacity-60"
            >
              {pending ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-500">
            Demo: demo@businessaios.com / demo1234
          </p>
          <p className="mt-3 text-center text-xs text-slate-500">
            No account?{' '}
            <Link href="/register" className="font-medium text-indigo-600 hover:text-indigo-700">
              Create a workspace
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
