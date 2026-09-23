export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:5000';

const TOKEN_KEY = 'bao_token';
const ORG_KEY = 'bao_org';
const ORG_NAME_KEY = 'bao_org_name';
const USER_KEY = 'bao_user';

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

export function setSession(token: string, orgId: string, user: SessionUser, orgName?: string) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(ORG_KEY, orgId);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  if (orgName) sessionStorage.setItem(ORG_NAME_KEY, orgName);
}

export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(ORG_KEY);
  sessionStorage.removeItem(ORG_NAME_KEY);
  sessionStorage.removeItem(USER_KEY);
}

// ponytail: sessionStorage bearer (tab-scoped). Cookie/HttpOnly BFF is the hardening upgrade.
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  const orgId = getOrgId();
  if (options.auth !== false && token) {
    headers.Authorization = `Bearer ${token}`;
    if (orgId) headers['x-organization-id'] = orgId;
  }
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
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

export async function login(email: string, password: string) {
  const res = await api<{ user: SessionUser; token: string }>('/api/v1/identity/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });

  const meRes = await fetch(`${API_URL}/api/v1/identity/me`, {
    headers: { Authorization: `Bearer ${res.token}` },
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
  const first = memberships[0];
  setSession(res.token, first.organizationId, res.user, first.orgName);
  return { user: res.user, memberships };
}
