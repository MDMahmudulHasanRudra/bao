export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:5000';

const TOKEN_KEY = 'bao_token';
const ORG_KEY = 'bao_org';
const ORG_NAME_KEY = 'bao_org_name';
const USER_KEY = 'bao_user';
const MEMBERSHIPS_KEY = 'bao_memberships';

export type SessionUser = { id: string; email: string; name: string; avatarUrl?: string };
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
    error?: { message?: string };
  };
  if (!res.ok) {
    if (res.status === 401 && options.auth !== false) clearSession();
    throw new Error(data?.error?.message || `Request failed (${res.status})`);
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

export async function login(email: string, password: string) {
  const res = await api<{ user: SessionUser; token: string }>('/api/v1/identity/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
  return establishSession(res.token, res.user);
}

export async function register(input: {
  name: string;
  email: string;
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
