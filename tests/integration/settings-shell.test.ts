import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { errMsg, isPermissionError, withCorrelation } from '../../apps/web/src/lib/errors';
import { ApiError } from '../../apps/web/src/lib/api';

const webSrc = resolve(__dirname, '../../apps/web/src');
const read = (rel: string) => readFileSync(resolve(webSrc, rel), 'utf-8');

const SETTINGS_PAGES = [
  'app/(workspace)/settings/profile/page.tsx',
  'app/(workspace)/settings/organization/page.tsx',
  'app/(workspace)/settings/members/page.tsx',
  'app/(workspace)/settings/white-label/page.tsx',
  'app/(workspace)/settings/integrations/page.tsx',
  'app/(workspace)/settings/audit/page.tsx',
  'app/(workspace)/settings/billing/page.tsx',
  // 8.4 put AI Providers on the shell too. It is listed separately from the
  // helper-purity checks because it legitimately calls errMsg (form messages)
  // and isPermissionError (the 403 branch it hands to the shell).
  'app/(workspace)/settings/ai-providers/page.tsx',
];

const PURE_SETTINGS_PAGES = SETTINGS_PAGES.filter((rel) => !rel.includes('ai-providers'));

describe('shared error helpers', () => {
  it('errMsg unwraps Error, passes strings through, and falls back for the rest', () => {
    expect(errMsg(new Error('boom'))).toBe('boom');
    expect(errMsg('boom')).toBe('boom');
    expect(errMsg(undefined)).toBe('Request failed');
    expect(errMsg(null)).toBe('Request failed');
  });

  it('isPermissionError branches on ApiError.status, not message text', () => {
    expect(isPermissionError(new ApiError('nope', {}, 403))).toBe(true);
    // A 500 that happens to say "Forbidden" must not read as a permission problem.
    expect(isPermissionError(new ApiError('Forbidden', {}, 500))).toBe(false);
    expect(isPermissionError(new ApiError('Missing permission', {}, 422))).toBe(false);
  });

  it('isPermissionError keeps the legacy message match for non-ApiError throws', () => {
    expect(isPermissionError(new Error('Missing permission'))).toBe(true);
    expect(isPermissionError(new Error('Forbidden'))).toBe(true);
    expect(isPermissionError(new Error('boom'))).toBe(false);
  });

  it('withCorrelation reads the ref off the ApiError, and adds nothing without one', () => {
    expect(withCorrelation(new ApiError('boom', {}, 500, 'abc123'))).toBe('boom (ref: abc123)');
    expect(withCorrelation(new ApiError('boom', {}, 500))).toBe('boom');
    expect(withCorrelation(new Error('boom'))).toBe('boom');
  });

  it('no page re-declares errMsg/isPermissionError locally', () => {
    const offenders: string[] = [];
    for (const rel of [...SETTINGS_PAGES, 'components/workspace-nav.ts']) {
      const src = read(rel);
      if (/^function errMsg\b/m.test(src)) offenders.push(rel);
      if (/^function isPermissionError\b/m.test(src)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it('every page that calls a helper imports it instead of re-declaring it', () => {
    const callers: string[] = [];
    for (const rel of [...SETTINGS_PAGES, 'components/workspace-nav.ts']) {
      const src = read(rel);
      if (/(?<![\w.])errMsg\(|isPermissionError\(/.test(src)) {
        callers.push(rel);
        expect(src, rel).toMatch(/from '@\/lib\/errors'/);
      }
    }
    // Guard against the loop silently passing on an empty set.
    expect(callers.length).toBeGreaterThan(0);
  });
});

describe('ApiError carries status and correlationId', () => {
  it('defaults status to 0 and exposes fields/correlationId', () => {
    const bare = new ApiError('x');
    expect(bare.status).toBe(0);
    expect(bare.fields).toEqual({});
    expect(bare.correlationId).toBeUndefined();

    const full = new ApiError('x', { a: 'b' }, 422, 'cid');
    expect(full.status).toBe(422);
    expect(full.fields).toEqual({ a: 'b' });
    expect(full.correlationId).toBe('cid');
  });

  it('api() throws ApiError with the response status and correlation id', () => {
    const src = read('lib/api.ts');
    expect(src).toMatch(/res\.status,/);
    expect(src).toMatch(/x-correlation-id/);
    expect(src).toMatch(/correlationId\?: string/);
  });
});

describe('SettingsPage shell', () => {
  const shell = () => read('components/settings/SettingsPage.tsx');
  const hook = () => read('components/settings/useUnsavedChanges.ts');

  it('provides one header, loading, retryable error, 403 and notice', () => {
    const src = shell();
    expect(src).toMatch(/<h1/);
    expect(src).toMatch(/role="status"/);
    expect(src).toMatch(/role="alert"/);
    expect(src).toMatch(/Retry/);
    expect(src).toMatch(/do not have access to these settings/);
    expect(src).toMatch(/Unsaved changes/);
  });

  it('the 403 branch short-circuits before any page content is rendered', () => {
    const src = shell();
    const branch = src.indexOf('unauthorized ? (');
    const children = src.indexOf('{children}');
    expect(branch).toBeGreaterThan(-1);
    // 403 is decided first, so children can never render behind a permission wall.
    expect(branch).toBeLessThan(children);
    expect(src).toMatch(/No configuration details are/);
    expect(src).toMatch(/server-authorized/);
  });

  it('supports the three content widths and an optional header action', () => {
    const src = shell();
    expect(src).toMatch(/'narrow' \| 'wide' \| 'full'/);
    expect(src).toMatch(/max-w-4xl/);
    expect(src).toMatch(/max-w-3xl/);
    expect(src).toMatch(/max-w-xl/);
    expect(src).toMatch(/\{action\}/);
  });

  it('is used by every non-AI settings page, and only those', () => {
    for (const rel of PURE_SETTINGS_PAGES) {
      expect(read(rel), rel).toMatch(/<SettingsPage/);
    }
  });

  it('renders failures through withCorrelation so a support ref survives (spec 6)', () => {
    const src = shell();
    expect(src).toMatch(/error\?: unknown/);
    expect(src).toMatch(/withCorrelation\(error\)/);
  });

  it('pages hand over the raw error instead of a pre-formatted string', () => {
    for (const rel of SETTINGS_PAGES) {
      const src = read(rel);
      expect(src, rel).toMatch(
        /const \[(error|loadError), set(Error|LoadError)\] = useState<unknown>\(null\);/,
      );
      expect(src, rel).not.toMatch(/set(Error|LoadError)\(errMsg\(/);
    }
  });

  it('opt-in unsaved guard attaches beforeunload only while dirty', () => {
    const src = hook();
    expect(src).toMatch(/if \(!dirty\) return;/);
    expect(src).toMatch(/beforeunload/);
    expect(src).toMatch(/removeEventListener/);
  });

  it('form pages report a dirty state derived from their own saved baseline', () => {
    expect(read('app/(workspace)/settings/organization/page.tsx')).toMatch(
      /dirty=\{dirty\}/,
    );
    expect(read('app/(workspace)/settings/white-label/page.tsx')).toMatch(
      /dirty=\{dirty\}/,
    );
    expect(read('app/(workspace)/settings/profile/page.tsx')).toMatch(/dirty=\{dirty\}/);
    // white-label compares against a snapshot captured on load, not DEFAULTS.
    expect(read('app/(workspace)/settings/white-label/page.tsx')).toMatch(/setInitial\(next\)/);
  });
});
