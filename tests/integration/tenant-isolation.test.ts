import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

vi.mock('@bao/config', async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long!!';
  process.env.JWT_EXPIRES_IN = '1h';
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters!';
  process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/test';
  process.env.STORAGE_ACCESS_KEY = 'test';
  process.env.STORAGE_SECRET_KEY = 'test';
  process.env.AI_API_KEY = 'test';
  process.env.ENCRYPTION_KEY =
    process.env.ENCRYPTION_KEY || 'test-encryption-key-at-least-32-chars!!';
  const real = await vi.importActual<typeof import('@bao/config')>('@bao/config');
  return {
    ...real,
    loadEnv: () => real.loadEnv(),
    getEnv: () => real.loadEnv(),
  };
});

vi.mock('../../apps/api/src/db/index.js', () => ({
  getDb: vi.fn(),
  closeDb: vi.fn(),
}));

import { validateRoleChange } from '../../apps/api/src/modules/access-control/routes.js';
import {
  tenantMiddleware,
  hasPermission,
  requirePermission,
} from '../../apps/api/src/core/tenancy/context.js';
import { signToken, verifyToken, authMiddleware } from '../../apps/api/src/core/auth/jwt.js';

describe('RBAC — validateRoleChange', () => {
  it('rejects invalid role strings', () => {
    expect(() => validateRoleChange('owner', 'superadmin', false)).toThrow(/Invalid role/);
    expect(() => validateRoleChange('owner', '', false)).toThrow(/Invalid role/);
    expect(() => validateRoleChange('owner', 'OWNER', false)).toThrow(/Invalid role/);
  });

  it('rejects assigning a role higher than requester', () => {
    expect(() => validateRoleChange('admin', 'owner', false)).toThrow(/higher than your own/);
    expect(() => validateRoleChange('manager', 'admin', false)).toThrow(/higher than your own/);
    expect(() => validateRoleChange('viewer', 'member', false)).toThrow(/higher than your own/);
  });

  it('rejects assigning a role equal to requester (except owner→owner)', () => {
    expect(() => validateRoleChange('admin', 'admin', false)).toThrow(/equal to your own/);
    expect(() => validateRoleChange('manager', 'manager', false)).toThrow(/equal to your own/);
    expect(() => validateRoleChange('viewer', 'viewer', false)).toThrow(/equal to your own/);
  });

  it('rejects self role change regardless of target role', () => {
    expect(() => validateRoleChange('owner', 'admin', true)).toThrow(/Cannot change your own role/);
    expect(() => validateRoleChange('admin', 'viewer', true)).toThrow(
      /Cannot change your own role/,
    );
  });

  it('allows owner to assign any lower role to another user', () => {
    expect(() => validateRoleChange('owner', 'admin', false)).not.toThrow();
    expect(() => validateRoleChange('owner', 'viewer', false)).not.toThrow();
    expect(() => validateRoleChange('admin', 'member', false)).not.toThrow();
    expect(() => validateRoleChange('manager', 'viewer', false)).not.toThrow();
  });

  it('only owner can assign owner role to others', () => {
    expect(() => validateRoleChange('owner', 'owner', false)).not.toThrow();
    expect(() => validateRoleChange('admin', 'owner', false)).toThrow(/higher than your own/);
  });
});

describe('Tenant middleware', () => {
  let dbModule: Awaited<ReturnType<typeof import('../../apps/api/src/db/index.js')>>;

  beforeEach(async () => {
    dbModule = await import('../../apps/api/src/db/index.js');
    vi.mocked(dbModule.getDb).mockReset();
  });

  function makeCtx(userId: string | undefined, orgHeader: string | undefined, membership: unknown) {
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(membership ? [membership] : []),
    };
    vi.mocked(dbModule.getDb).mockReturnValue(mockDb as never);
    const sets: Record<string, unknown> = {};
    if (userId) sets.userId = userId;
    return {
      get: (k: string) => sets[k],
      set: (k: string, v: unknown) => {
        sets[k] = v;
      },
      req: { header: (n: string) => (n === 'x-organization-id' ? orgHeader : undefined) },
      _sets: sets,
    };
  }

  it('rejects when no userId (unauthenticated)', async () => {
    const mw = tenantMiddleware();
    const c = makeCtx(undefined, 'org-1', null);
    await expect(mw(c as never, vi.fn())).rejects.toThrow(/Authentication required/);
  });

  it('rejects when no x-organization-id header', async () => {
    const mw = tenantMiddleware();
    const c = makeCtx('u1', undefined, null);
    await expect(mw(c as never, vi.fn())).rejects.toThrow(/Organization context required/);
  });

  it('rejects when user is not a member of the organization', async () => {
    const mw = tenantMiddleware();
    const c = makeCtx('u1', 'org-b', null);
    await expect(mw(c as never, vi.fn())).rejects.toThrow(/Not a member/);
  });

  it('sets tenant context with membership role when user is a member', async () => {
    const mw = tenantMiddleware();
    const membership = { userId: 'u1', organizationId: 'org-a', role: 'viewer' };
    const c = makeCtx('u1', 'org-a', membership);
    const next = vi.fn();
    await mw(c as never, next);
    expect(next).toHaveBeenCalled();
    expect(c._sets.tenant).toEqual({ userId: 'u1', organizationId: 'org-a', role: 'viewer' });
  });
});

describe('permission matrix — foundation entries', () => {
  it('org.settings.manage: owner and admin only', () => {
    expect(hasPermission('owner', 'org.settings.manage')).toBe(true);
    expect(hasPermission('admin', 'org.settings.manage')).toBe(true);
    expect(hasPermission('manager', 'org.settings.manage')).toBe(false);
    expect(hasPermission('viewer', 'org.settings.manage')).toBe(false);
  });

  it('members.manage: owner and admin only', () => {
    expect(hasPermission('owner', 'members.manage')).toBe(true);
    expect(hasPermission('admin', 'members.manage')).toBe(true);
    expect(hasPermission('analyst', 'members.manage')).toBe(false);
    expect(hasPermission('member', 'members.manage')).toBe(false);
  });

  it('intelligence.targets.manage: owner, admin, and analyst', () => {
    expect(hasPermission('owner', 'intelligence.targets.manage')).toBe(true);
    expect(hasPermission('admin', 'intelligence.targets.manage')).toBe(true);
    expect(hasPermission('analyst', 'intelligence.targets.manage')).toBe(true);
    expect(hasPermission('member', 'intelligence.targets.manage')).toBe(false);
    expect(hasPermission('viewer', 'intelligence.targets.manage')).toBe(false);
  });

  it('audit.read: owner and admin only', () => {
    expect(hasPermission('owner', 'audit.read')).toBe(true);
    expect(hasPermission('admin', 'audit.read')).toBe(true);
    expect(hasPermission('analyst', 'audit.read')).toBe(false);
    expect(hasPermission('member', 'audit.read')).toBe(false);
    expect(hasPermission('viewer', 'audit.read')).toBe(false);
  });

  it('unknown permission denies all roles', () => {
    expect(hasPermission('owner', 'no.such.permission')).toBe(false);
    expect(hasPermission('admin', 'no.such.permission')).toBe(false);
  });

  it('requirePermission rejects with actionable message', async () => {
    const mw = requirePermission('members.manage');
    const c = {
      get: (k: string) =>
        k === 'tenant' ? { userId: 'u', organizationId: 'o', role: 'member' } : undefined,
    };
    const next = vi.fn();
    await expect(mw(c as never, next)).rejects.toThrow(/Missing permission: members\.manage/);
    expect(next).not.toHaveBeenCalled();
  });

  it('requirePermission passes for an allowed role', async () => {
    const mw = requirePermission('members.manage');
    const c = {
      get: (k: string) =>
        k === 'tenant' ? { userId: 'u', organizationId: 'o', role: 'admin' } : undefined,
    };
    const next = vi.fn();
    await mw(c as never, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('Authentication — JWT', () => {
  it('signs and verifies a token round-trip', () => {
    const token = signToken({ sub: 'user-123', email: 'a@b.com' });
    const payload = verifyToken(token);
    expect(payload.sub).toBe('user-123');
    expect(payload.email).toBe('a@b.com');
  });

  it('rejects a token signed with a different secret', () => {
    const badToken = jwt.sign({ sub: 'x', email: 'x@y.z' }, 'wrong-secret-at-least-32-chars-long!');
    expect(() => verifyToken(badToken)).toThrow();
  });

  it('rejects a tampered token payload', () => {
    const token = signToken({ sub: 'user-123', email: 'a@b.com' });
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    payload.sub = 'attacker';
    parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
    expect(() => verifyToken(parts.join('.'))).toThrow();
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign({ sub: 'u', email: 'e@x.com' }, process.env.JWT_SECRET!, {
      expiresIn: '-1s',
    });
    expect(() => verifyToken(expired)).toThrow();
  });

  it('authMiddleware rejects missing header', async () => {
    const mw = authMiddleware();
    const c = { req: { header: () => undefined }, set: vi.fn() };
    await expect(mw(c as never, vi.fn())).rejects.toThrow(/Missing authorization/);
  });

  it('authMiddleware rejects invalid token', async () => {
    const mw = authMiddleware();
    const c = { req: { header: () => 'Bearer not-a-real-token' }, set: vi.fn() };
    await expect(mw(c as never, vi.fn())).rejects.toThrow(/Invalid or expired/);
  });

  it('authMiddleware sets userId on valid token', async () => {
    const token = signToken({ sub: 'user-99', email: 'u@t.com' });
    const mw = authMiddleware();
    const set = vi.fn();
    const c = { req: { header: () => `Bearer ${token}` }, set };
    const next = vi.fn();
    await mw(c as never, next);
    expect(set).toHaveBeenCalledWith('userId', 'user-99');
    expect(next).toHaveBeenCalled();
  });
});
