import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ALL_NAV,
  DASHBOARD_ITEM,
  NAV_GROUPS,
  SETTINGS_NAV,
  findNavItem,
  isSettingsCategory,
} from '../../apps/web/src/components/workspace-nav.js';

const WEB = 'apps/web/src';
const read = (f: string) => readFileSync(resolve(f), 'utf-8');
const layoutSrc = read(`${WEB}/app/(workspace)/layout.tsx`);

describe('workspace navigation: structure', () => {
  it('exposes exactly one primary-nav entry for settings', () => {
    const settingsItems = ALL_NAV.filter((i) => i.href === '/settings' || i.href.startsWith('/settings'));
    expect(settingsItems).toHaveLength(1);
    expect(settingsItems[0].href).toBe('/settings');
  });

  it('keeps the dashboard as an ungrouped home, not a group member', () => {
    expect(ALL_NAV[0]).toBe(DASHBOARD_ITEM);
    expect(NAV_GROUPS.flatMap((g) => g.items)).not.toContain(DASHBOARD_ITEM);
  });

  it('orders the groups the way the specification requires', () => {
    expect(NAV_GROUPS.map((g) => g.id)).toEqual(['work', 'knowledge', 'insights', 'more', 'system']);
    // CRM leads the Work group; Settings is last, immediately before the account menu.
    expect(NAV_GROUPS[0].items[0].href).toBe('/sales');
    expect(NAV_GROUPS[NAV_GROUPS.length - 1].id).toBe('system');
  });

  it('gives every item its own icon key', () => {
    // Regression: the old nav reused `moduleId` for the icon, so all eight settings
    // entries rendered the same gear. iconId is now a separate field.
    const items = [DASHBOARD_ITEM, ...NAV_GROUPS.flatMap((g) => g.items)];
    for (const item of items) {
      expect(item.iconId, item.href).toBeTruthy();
      expect(item.iconId, item.href).not.toBe('');
    }
  });

  it('points every entry at a route that exists', () => {
    for (const item of ALL_NAV) {
      expect(existsSync(resolve(WEB, 'app/(workspace)', `${item.href.slice(1)}/page.tsx`)), item.href)
        .toBe(true);
    }
  });

  it('resolves a deep link to its section, not to nothing', () => {
    expect(findNavItem('/settings')?.href).toBe('/settings');
    expect(findNavItem('/settings/audit')?.href).toBe('/settings');
    expect(findNavItem('/sales')?.label).toBe('Leads & CRM');
    expect(findNavItem('/nowhere')).toBeUndefined();
  });
});

describe('workspace navigation: registry-backed availability', () => {
  it('hides modules the registry does not return, and shows the rest when it is unknown', () => {
    // The registry failed (state stays null) -> show everything rather than an empty shell.
    expect(layoutSrc).toContain('!registry || item.moduleId in registry');
    expect(layoutSrc).toContain('setRegistry(null)');
  });

  it('distinguishes "no usable screen" from "not enabled"', () => {
    // Present but uiAvailable === false keeps its place and is badged, never styled active.
    expect(layoutSrc).toContain('registry[item.moduleId] !== false');
    expect(layoutSrc).toContain('const active = !noUi &&');
    expect(layoutSrc).toContain('Coming soon');
  });

  it('gates navigation on the module registry, not on a second hardcoded list', () => {
    // Regression guard: a local NAV array is how the sidebar drifted from the API before.
    expect(layoutSrc).not.toMatch(/const NAV = \[/);
    expect(layoutSrc).toContain("api<ModulesPayload>('/api/v1/modules')");
  });

  it('every nav item names a module the server registry actually knows', () => {
    const registry = read('apps/api/src/modules/module-registry/routes.ts');
    const known = new Set(
      [...registry.matchAll(/^\s*id: '([^']+)',$/gm)].map((m) => m[1]),
    );
    for (const item of ALL_NAV) {
      expect(known.has(item.moduleId), `${item.href} -> ${item.moduleId}`).toBe(true);
    }
  });
});

describe('centralized settings workspace', () => {
  it('has a landing route, so /settings is not a dead end', () => {
    expect(existsSync(resolve(WEB, 'app/(workspace)/settings/page.tsx'))).toBe(true);
  });

  it('puts the settings shell in a layout so every page inherits it', () => {
    expect(existsSync(resolve(WEB, 'app/(workspace)/settings/layout.tsx'))).toBe(true);
    const src = read(`${WEB}/app/(workspace)/settings/layout.tsx`);
    expect(src).toContain('aria-label="Settings"');
    expect(src).toContain('aria-current');
  });

  it('lists every existing settings page and nothing that does not exist', () => {
    const pages = [
      'profile',
      'organization',
      'members',
      'ai-providers',
      'integrations',
      'audit',
      'white-label',
      'billing',
    ];
    for (const page of pages) {
      expect(existsSync(resolve(WEB, 'app/(workspace)/settings', `${page}/page.tsx`)), page).toBe(
        true,
      );
      expect(SETTINGS_NAV.some((c) => c.href === `/settings/${page}`), page).toBe(true);
    }
    for (const category of SETTINGS_NAV) {
      expect(
        existsSync(resolve(WEB, 'app/(workspace)', `${category.href.slice(1)}/page.tsx`)),
        category.href,
      ).toBe(true);
    }
  });

  it('omits settings that have no backend instead of faking them', () => {
    // Notification preferences and session controls are spec items with no API yet.
    const src = read('apps/web/src/components/workspace-nav.ts');
    expect(SETTINGS_NAV.some((c) => /notification/i.test(c.label))).toBe(false);
    expect(SETTINGS_NAV.some((c) => /session|password/i.test(c.label))).toBe(false);
    expect(src).toContain('no backend');
  });

  it('recognises a settings deep link', () => {
    expect(isSettingsCategory('/settings/ai-providers')).toBe(true);
    expect(isSettingsCategory('/sales')).toBe(false);
  });
});
