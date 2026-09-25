'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, getToken, inviteRegisterPath } from '@/lib/api';

type InviteInfo = {
  email: string;
  role: string;
  organizationName: string;
  expiresAt: string;
};

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : 'Request failed';
}

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<InviteInfo>(`/api/v1/identity/invites/${token}`, { auth: false });
      setInfo(res);
    } catch (err) {
      setError(errMsg(err));
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function accept() {
    setBusy(true);
    setFlash(null);
    try {
      const res = await api<{ organization: { id: string; name: string } | null }>(
        `/api/v1/access-control/invites/${token}/accept`,
        { method: 'POST' },
      );
      const me = await api<{
        memberships: {
          id: string;
          role: string;
          organizationId: string;
          orgName: string;
          orgSlug: string;
        }[];
      }>('/api/v1/identity/me');
      const target =
        me.memberships.find((m) => m.organizationId === res.organization?.id) || me.memberships[0];
      if (target) {
        sessionStorage.setItem('bao_org', target.organizationId);
        sessionStorage.setItem('bao_org_name', target.orgName);
        sessionStorage.setItem('bao_memberships', JSON.stringify(me.memberships));
      }
      router.replace('/dashboard');
    } catch (err) {
      setFlash(errMsg(err));
      setBusy(false);
    }
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div
          role="alert"
          className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8"
        >
          <h1 className="text-lg font-semibold text-slate-900">Invite unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
          <p className="mt-4 text-xs text-slate-500">
            Links expire after 7 days. Ask an admin to send a new one from Settings → Members.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Go to sign in
          </Link>
        </div>
      </main>
    );
  }

  if (!info) {
    return (
      <main
        role="status"
        className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500"
      >
        Loading invite…
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Invitation</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">Join {info.organizationName}</h1>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Email</dt>
            <dd className="font-medium text-slate-800">{info.email}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Role</dt>
            <dd className="font-medium text-slate-800">{info.role}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Expires</dt>
            <dd className="font-medium text-slate-800">
              {new Date(info.expiresAt).toLocaleDateString()}
            </dd>
          </div>
        </dl>

        {flash && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {flash}
          </p>
        )}

        <div className="mt-6 space-y-3">
          {getToken() ? (
            <button
              type="button"
              onClick={() => void accept()}
              disabled={busy}
              className="w-full cursor-pointer rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {busy ? 'Joining…' : 'Accept invite'}
            </button>
          ) : (
            <Link
              href={inviteRegisterPath(token)}
              className="block w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-indigo-700"
            >
              Create account &amp; join
            </Link>
          )}
          <Link
            href="/login"
            className="block w-full rounded-lg border border-slate-200 px-4 py-2.5 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Sign in instead
          </Link>
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">
          Invited to a different account? Sign in with that email first.
        </p>
      </div>
    </main>
  );
}
