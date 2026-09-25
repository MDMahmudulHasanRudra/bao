export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:5000';

const TOKEN_KEY = 'bao_token';
const ORG_KEY = 'bao_org';
const ORG_NAME_KEY = 'bao_org_name';
const USER_KEY = 'bao_user';
const MEMBERSHIPS_KEY = 'bao_memberships';

export type SessionUser = {
  id: string;
  username: string;
  name: string;
  avatarUrl?: string | null;
  jobTitle?: string | null;
  team?: string | null;
  phone?: string | null;
  timezone?: string | null;
  bio?: string | null;
};
export type Membership = {
  id: string;
  role: string;
  organizationId: string;
  orgName: string;
  orgSlug: string;
};

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getOrgId(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(ORG_KEY);
}

export function getOrgName(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(ORG_NAME_KEY);
}

export function getUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function getMemberships(): Membership[] {
  if (typeof window === 'undefined') return [];
  const raw = sessionStorage.getItem(MEMBERSHIPS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Membership[];
  } catch {
    return [];
  }
}

export function setSession(
  token: string,
  orgId: string,
  user: SessionUser,
  orgName?: string,
  memberships?: Membership[],
) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(ORG_KEY, orgId);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  if (orgName) sessionStorage.setItem(ORG_NAME_KEY, orgName);
  if (memberships) sessionStorage.setItem(MEMBERSHIPS_KEY, JSON.stringify(memberships));
}

export function switchOrg(orgId: string, orgName: string) {
  sessionStorage.setItem(ORG_KEY, orgId);
  sessionStorage.setItem(ORG_NAME_KEY, orgName);
  // Full reload clears module/notification state tied to the previous org.
  window.location.href = '/dashboard';
}

export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(ORG_KEY);
  sessionStorage.removeItem(ORG_NAME_KEY);
  sessionStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(MEMBERSHIPS_KEY);
}

// Keeps the header avatar/name in sync after a profile save, no reload needed.
export const USER_UPDATED_EVENT = 'bao:user-updated';

export function updateSessionUser(patch: Partial<SessionUser>) {
  const current = getUser();
  if (!current) return;
  sessionStorage.setItem(USER_KEY, JSON.stringify({ ...current, ...patch }));
  window.dispatchEvent(new Event(USER_UPDATED_EVENT));
}

export type FieldErrors = Record<string, string>;

// Field-level messages come back on error.details, not error.message.
export class ApiError extends Error {
  constructor(
    message: string,
    readonly fields: FieldErrors = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ponytail: sessionStorage bearer (tab-scoped). Cookie/HttpOnly BFF is the hardening upgrade.
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const isForm = options.body instanceof FormData;
  const headers: Record<string, string> = isForm ? {} : { 'Content-Type': 'application/json' };
  const token = getToken();
  const orgId = getOrgId();
  if (options.auth !== false && token) {
    headers.Authorization = `Bearer ${token}`;
    if (orgId) headers['x-organization-id'] = orgId;
  }
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body:
      options.body === undefined
        ? undefined
        : isForm
          ? (options.body as FormData)
          : JSON.stringify(options.body),
  });
  const data = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string; details?: Record<string, string> };
  };
  if (!res.ok) {
    if (res.status === 401 && options.auth !== false) clearSession();
    throw new ApiError(data?.error?.message || `Request failed (${res.status})`, data?.error?.details || {});
  }
  return data;
}

async function establishSession(token: string, user: SessionUser, preferOrgId?: string) {
  const meRes = await fetch(`${API_URL}/api/v1/identity/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const me = (await meRes.json()) as {
    memberships?: Membership[];
    error?: { message?: string };
  };
  if (!meRes.ok) {
    throw new Error(me.error?.message || 'Failed to load memberships');
  }

  const memberships = me.memberships || [];
  if (!memberships.length) {
    throw new Error('No organization membership for this account');
  }
  const chosen =
    (preferOrgId && memberships.find((m) => m.organizationId === preferOrgId)) || memberships[0];
  setSession(token, chosen.organizationId, user, chosen.orgName, memberships);
  return { user, memberships };
}

export async function login(username: string, password: string) {
  const res = await api<{ user: SessionUser; token: string }>('/api/v1/identity/login', {
    method: 'POST',
    body: { username: username.trim(), password },
    auth: false,
  });
  return establishSession(res.token, res.user);
}

export async function register(input: {
  name: string;
  username: string;
  password: string;
  inviteToken?: string;
  organizationName?: string;
}) {
  const res = await api<{
    user: SessionUser;
    token: string;
    organizationId: string;
    orgName: string;
  }>('/api/v1/identity/register', { method: 'POST', body: input, auth: false });
  return establishSession(res.token, res.user, res.organizationId);
}

export function inviteRegisterPath(token: string): string {
  return `/register?invite=${encodeURIComponent(token)}`;
}

export type ProfileInput = Partial<
  Pick<SessionUser, 'name' | 'jobTitle' | 'team' | 'phone' | 'timezone' | 'bio'>
>;

export async function fetchProfile() {
  return api<{ user: SessionUser; memberships: Membership[] }>('/api/v1/identity/me');
}

export async function updateProfile(input: ProfileInput) {
  const res = await api<{ user: SessionUser }>('/api/v1/identity/me', {
    method: 'PATCH',
    body: input,
  });
  updateSessionUser(res.user);
  return res.user;
}

export async function changePassword(currentPassword: string, newPassword: string) {
  return api<{ success: boolean }>('/api/v1/identity/me/password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
}

export async function uploadAvatar(file: File) {
  const form = new FormData();
  form.append('file', file);
  const res = await api<{ avatarUrl: string }>('/api/v1/identity/me/avatar', {
    method: 'POST',
    body: form,
  });
  updateSessionUser({ avatarUrl: res.avatarUrl });
  return res.avatarUrl;
}
