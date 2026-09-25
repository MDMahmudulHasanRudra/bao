'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ApiError,
  changePassword,
  fetchProfile,
  updateProfile,
  uploadAvatar,
  type FieldErrors,
  type SessionUser,
} from '@/lib/api';

type Form = {
  name: string;
  jobTitle: string;
  team: string;
  phone: string;
  timezone: string;
  bio: string;
};

const EMPTY: Form = { name: '', jobTitle: '', team: '', phone: '', timezone: '', bio: '' };

function toForm(user: SessionUser): Form {
  return {
    name: user.name || '',
    jobTitle: user.jobTitle || '',
    team: user.team || '',
    phone: user.phone || '',
    timezone: user.timezone || '',
    bio: user.bio || '',
  };
}

function fieldErrors(e: unknown): FieldErrors {
  return e instanceof ApiError ? e.fields : {};
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : 'Request failed';
}

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';
const labelCls = 'block text-xs font-medium text-slate-600';

export default function ProfileSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);

  const [savingProfile, setSavingProfile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [profileErrors, setProfileErrors] = useState<FieldErrors>({});
  const [avatarErrors, setAvatarErrors] = useState<FieldErrors>({});

  const [pwErrors, setPwErrors] = useState<FieldErrors>({});
  const [pwBusy, setPwBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetchProfile();
      setUser(res.user);
      setForm(toForm(res.user));
    } catch (e) {
      setLoadError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function set(key: keyof Form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function notify(ok: boolean, text: string) {
    setFlash({ ok, text });
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileErrors({});
    setFlash(null);
    try {
      const saved = await updateProfile({
        name: form.name,
        jobTitle: form.jobTitle,
        team: form.team,
        phone: form.phone,
        timezone: form.timezone,
        bio: form.bio,
      });
      setUser(saved);
      setForm(toForm(saved));
      notify(true, 'Profile saved.');
    } catch (e) {
      setProfileErrors(fieldErrors(e));
      notify(false, errMsg(e));
    } finally {
      setSavingProfile(false);
    }
  }

  async function onPickAvatar(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setAvatarErrors({});
    setFlash(null);
    try {
      const avatarUrl = await uploadAvatar(file);
      setUser((prev) => (prev ? { ...prev, avatarUrl } : prev));
      notify(true, 'Photo updated.');
    } catch (e) {
      setAvatarErrors(fieldErrors(e));
      notify(false, errMsg(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    const errors: FieldErrors = {};
    if (!currentPassword) errors.currentPassword = 'Enter your current password';
    if (newPassword.length < 8) errors.newPassword = 'Password must be at least 8 characters';
    if (newPassword !== confirmPassword) errors.newPassword = 'Passwords do not match';
    if (Object.keys(errors).length) {
      setPwErrors(errors);
      return;
    }

    setPwBusy(true);
    setPwErrors({});
    setFlash(null);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      notify(true, 'Password changed. Use it the next time you sign in.');
    } catch (e) {
      setPwErrors(fieldErrors(e));
      notify(false, errMsg(e));
    } finally {
      setPwBusy(false);
    }
  }

  if (loading) {
    return (
      <div
        role="status"
        className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500"
      >
        Loading your profile…
      </div>
    );
  }

  if (loadError || !user) {
    return (
      <div role="alert" className="mx-auto max-w-md rounded-xl border border-red-200 bg-white p-6">
        <p className="text-sm text-slate-700">{loadError}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">My profile</h1>
        <p className="text-sm text-slate-500">
          Only your name is required. Everything else is optional.
        </p>
      </div>

      {flash && (
        <p
          role={flash.ok ? 'status' : 'alert'}
          className={`rounded-lg border px-3 py-2 text-sm ${
            flash.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {flash.text}
        </p>
      )}

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-indigo-100 text-lg font-semibold text-indigo-700">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              (user.name || user.username || '?').slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.username}</p>
            <label className="mt-2 inline-block cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
              {uploading ? 'Uploading…' : 'Change photo'}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => void onPickAvatar(e.target.files?.[0])}
              />
            </label>
            {avatarErrors.file && (
              <p role="alert" className="mt-1 text-xs text-red-600">
                {avatarErrors.file}
              </p>
            )}
          </div>
        </div>
      </section>

      <form
        onSubmit={(e) => void saveProfile(e)}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
      >
        <h2 className="text-sm font-semibold text-slate-900">Personal details</h2>

        <div>
          <label htmlFor="name" className={labelCls}>
            Name
          </label>
          <input
            id="name"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            className={inputCls}
            maxLength={255}
            required
            aria-invalid={!!profileErrors.name}
          />
          {profileErrors.name && (
            <p role="alert" className="mt-1 text-xs text-red-600">
              {profileErrors.name}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="jobTitle" className={labelCls}>
              Job title <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id="jobTitle"
              value={form.jobTitle}
              onChange={(e) => set('jobTitle', e.target.value)}
              className={inputCls}
              placeholder="Head of Sales"
              maxLength={120}
            />
            {profileErrors.jobTitle && (
              <p role="alert" className="mt-1 text-xs text-red-600">
                {profileErrors.jobTitle}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="team" className={labelCls}>
              Team <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id="team"
              value={form.team}
              onChange={(e) => set('team', e.target.value)}
              className={inputCls}
              placeholder="Revenue"
              maxLength={120}
            />
            {profileErrors.team && (
              <p role="alert" className="mt-1 text-xs text-red-600">
                {profileErrors.team}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="phone" className={labelCls}>
              Phone <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              className={inputCls}
              placeholder="+44 20 1234 5678"
              maxLength={40}
            />
            {profileErrors.phone && (
              <p role="alert" className="mt-1 text-xs text-red-600">
                {profileErrors.phone}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="timezone" className={labelCls}>
              Timezone <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id="timezone"
              value={form.timezone}
              onChange={(e) => set('timezone', e.target.value)}
              className={inputCls}
              placeholder="Europe/London"
              maxLength={64}
            />
            {profileErrors.timezone && (
              <p role="alert" className="mt-1 text-xs text-red-600">
                {profileErrors.timezone}
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="bio" className={labelCls}>
            About <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            id="bio"
            value={form.bio}
            onChange={(e) => set('bio', e.target.value)}
            className={`${inputCls} min-h-[88px] resize-y`}
            placeholder="A short introduction"
            maxLength={2000}
          />
          {profileErrors.bio && (
            <p role="alert" className="mt-1 text-xs text-red-600">
              {profileErrors.bio}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={savingProfile}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {savingProfile ? 'Saving…' : 'Save profile'}
        </button>
      </form>

      <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Username</h2>
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-md bg-slate-100 px-2 py-0.5 text-sm text-slate-800">
            {user.username}
          </code>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            Sign-in ID
          </span>
        </div>
        <p className="text-xs text-slate-500">
          This is the ID you sign in with, so it is not editable here. Ask an admin to change it.
        </p>
      </section>

      <form
        onSubmit={(e) => void savePassword(e)}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
      >
        <h2 className="text-sm font-semibold text-slate-900">Password</h2>

        <div>
          <label htmlFor="currentPassword" className={labelCls}>
            Current password
          </label>
          <input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={inputCls}
            aria-invalid={!!pwErrors.currentPassword}
          />
          {pwErrors.currentPassword && (
            <p role="alert" className="mt-1 text-xs text-red-600">
              {pwErrors.currentPassword}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="newPassword" className={labelCls}>
              New password
            </label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputCls}
              aria-invalid={!!pwErrors.newPassword}
            />
            {pwErrors.newPassword && (
              <p role="alert" className="mt-1 text-xs text-red-600">
                {pwErrors.newPassword}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="confirmPassword" className={labelCls}>
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        <p className="text-xs text-slate-500">At least 8 characters.</p>

        <button
          type="submit"
          disabled={pwBusy}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pwBusy ? 'Updating…' : 'Change password'}
        </button>
      </form>
    </div>
  );
}
