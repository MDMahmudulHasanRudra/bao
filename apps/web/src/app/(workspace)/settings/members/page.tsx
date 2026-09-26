'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, getUser, getMemberships } from '@/lib/api';
import { errMsg } from '@/lib/errors';
import SettingsPage from '@/components/settings/SettingsPage';

type Member = {
  id: string;
  role: string;
  joinedAt: string;
  userId: string;
  name: string;
  username: string;
};

type PendingInvite = {
  id: string;
  username: string;
  role: string;
  token: string;
  expiresAt: string;
};

const ROLES = ['owner', 'admin', 'manager', 'sales', 'contributor', 'analyst', 'member', 'viewer'];

function inviteUrl(token: string) {
  if (typeof window === 'undefined') return `/invite/${token}`;
  return `${window.location.origin}/invite/${token}`;
}

export default function MembersSettingsPage() {
  const user = getUser();
  const myMembership = getMemberships()[0];
  const canManage = myMembership?.role === 'owner' || myMembership?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [busy, setBusy] = useState(false);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [newInvite, setNewInvite] = useState<{ url: string; username: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, i] = await Promise.all([
        api<{ members: Member[] }>('/api/v1/access-control/members'),
        api<{ invites: PendingInvite[] }>('/api/v1/access-control/invites').catch(() => ({
          invites: [] as PendingInvite[],
        })),
      ]);
      setMembers(m.members);
      setInvites(i.invites);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function flashMsg(text: string, ok = true) {
    setFlash({ ok, text });
  }

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setFlash(null);
    setNewInvite(null);
    try {
      const res = await api<{ membership?: Member; invitePath?: string; invite?: PendingInvite }>(
        '/api/v1/access-control/invite',
        { method: 'POST', body: { username: inviteUsername.trim(), role: inviteRole } },
      );
      if (res.invitePath && res.invite) {
        const url = inviteUrl(res.invite.token);
        setNewInvite({ url, username: res.invite.username });
        flashMsg(`Invite link ready for ${res.invite.username} — copy and share it.`);
      } else {
        flashMsg(`${inviteUsername.trim()} added to the workspace.`);
      }
      setInviteUsername('');
      await load();
    } catch (err) {
      flashMsg(errMsg(err), false);
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(member: Member, role: string) {
    setFlash(null);
    try {
      await api(`/api/v1/access-control/members/${member.id}/role`, {
        method: 'PUT',
        body: { role },
      });
      flashMsg(`${member.name || member.username} is now ${role}.`);
      await load();
    } catch (err) {
      flashMsg(errMsg(err), false);
      await load();
    }
  }

  async function removeMember(member: Member) {
    if (!window.confirm(`Remove ${member.username} from this workspace?`)) return;
    setFlash(null);
    try {
      await api(`/api/v1/access-control/members/${member.id}`, { method: 'DELETE' });
      flashMsg(`${member.username} removed.`);
      await load();
    } catch (err) {
      flashMsg(errMsg(err), false);
    }
  }

  async function revokeInvite(invite: PendingInvite) {
    setFlash(null);
    try {
      await api(`/api/v1/access-control/invites/${invite.id}`, { method: 'DELETE' });
      flashMsg(`Invite for ${invite.username} revoked.`);
      await load();
    } catch (err) {
      flashMsg(errMsg(err), false);
    }
  }

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      flashMsg('Copy failed — select the link manually.', false);
    }
  }

  return (
    <SettingsPage
      title="Members"
      description="Invite people, change roles, and manage pending invites. Owner/admin only for changes."
      width="wide"
      loading={loading}
      error={error}
      onRetry={() => void load()}
      notice={flash}
    >
      {canManage && (
        <form
          onSubmit={(e) => void onInvite(e)}
          className="space-y-3 rounded-xl border border-slate-200 bg-white p-5"
        >
          <h2 className="text-sm font-semibold text-slate-800">Invite to workspace</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem_auto]">
            <div>
              <label htmlFor="inviteUsername" className="block text-xs font-medium text-slate-600">
                Username
              </label>
              <input
                id="inviteUsername"
                type="text"
                required
                minLength={3}
                maxLength={32}
                autoCapitalize="none"
                spellCheck={false}
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
                placeholder="teammate"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="inviteRole" className="block text-xs font-medium text-slate-600">
                Role
              </label>
              <select
                id="inviteRole"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="mt-1 w-full cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {ROLES.filter((r) => r !== 'owner').map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={busy}
                className="w-full cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 sm:w-auto"
              >
                {busy ? 'Sending…' : 'Invite'}
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Existing accounts are added instantly (they get a notification). New usernames get a 7-day
            invite link to copy.
          </p>
          {newInvite && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
              <p className="text-xs font-medium text-indigo-800">
                Invite link for {newInvite.username}
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  readOnly
                  value={newInvite.url}
                  aria-label="Invite link"
                  className="min-w-0 flex-1 rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-xs text-slate-700"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  type="button"
                  onClick={() => void copy(newInvite.url, 'new')}
                  className="cursor-pointer rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                >
                  {copiedId === 'new' ? 'Copied' : 'Copy link'}
                </button>
              </div>
            </div>
          )}
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Member
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Role
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Joined
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {members.map((m) => {
              const isSelf = m.userId === user?.id;
              return (
                <tr key={m.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">
                      {m.name}
                      {isSelf && <span className="ml-1 text-xs text-slate-400">(you)</span>}
                    </p>
                    <p className="text-xs text-slate-500">{m.username}</p>
                  </td>
                  <td className="px-4 py-3">
                    {canManage && !isSelf && m.role !== 'owner' ? (
                      <select
                        aria-label={`Role for ${m.username}`}
                        value={m.role}
                        onChange={(e) => void changeRole(m, e.target.value)}
                        className="cursor-pointer rounded-lg border border-slate-200 px-2 py-1 text-xs"
                      >
                        {ROLES.filter((r) => r !== 'owner' || myMembership?.role === 'owner').map(
                          (r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ),
                        )}
                      </select>
                    ) : (
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-700">
                        {m.role}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(m.joinedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canManage && !isSelf && m.role !== 'owner' && (
                      <button
                        type="button"
                        onClick={() => void removeMember(m)}
                        className="cursor-pointer text-xs font-medium text-rose-600 hover:text-rose-700"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {invites.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-800">Pending invites</h2>
          <ul className="mt-3 space-y-3">
            {invites.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-col gap-2 border-b border-slate-100 pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{inv.username}</p>
                  <p className="text-xs text-slate-500">
                    {inv.role} · expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => void copy(inviteUrl(inv.token), inv.id)}
                    className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {copiedId === inv.id ? 'Copied' : 'Copy link'}
                  </button>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => void revokeInvite(inv)}
                      className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SettingsPage>
  );
}
