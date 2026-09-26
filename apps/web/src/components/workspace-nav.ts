// Navigation model for the workspace shell. Order, grouping and labels come from
// docs/usability-navigation-settings-operations-spec.md section 2.
//
// The server module registry decides *whether* an item is shown (GET /api/v1/modules);
// this file decides order, grouping and labels. One fact per place is what stops the
// sidebar from drifting away from what the API actually allows.

export interface NavItem {
  href: string;
  label: string;
  /** Must match a module id in the server registry: that is the availability gate. */
  moduleId: string;
  /** Icon key. Separate from moduleId so several items can share one module. */
  iconId: string;
  /** Rendered in the sidebar footer, e.g. the unread notification count. */
  badge?: 'notifications';
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export const DASHBOARD_ITEM: NavItem = {
  href: '/dashboard',
  label: 'Dashboard',
  moduleId: 'dashboard',
  iconId: 'dashboard',
};

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'work',
    label: 'Work',
    items: [
      { href: '/sales', label: 'Leads & CRM', moduleId: 'sales', iconId: 'sales' },
      { href: '/proposals', label: 'Proposals', moduleId: 'proposals', iconId: 'proposals' },
      {
        href: '/presentations',
        label: 'Presentations',
        moduleId: 'presentations',
        iconId: 'presentations',
      },
    ],
  },
  {
    id: 'knowledge',
    label: 'Knowledge & AI',
    items: [
      { href: '/knowledge', label: 'Knowledge Hub', moduleId: 'knowledge', iconId: 'knowledge' },
      {
        href: '/assistant',
        label: 'AI Assistant',
        moduleId: 'ai-assistant',
        iconId: 'ai-assistant',
      },
      {
        href: '/intelligence',
        label: 'Monitoring',
        moduleId: 'intelligence',
        iconId: 'intelligence',
      },
      {
        href: '/lead-intelligence',
        label: 'Lead Intelligence',
        moduleId: 'lead-intelligence',
        iconId: 'lead-intelligence',
      },
      { href: '/automation', label: 'Automation', moduleId: 'automation', iconId: 'automation' },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    items: [
      { href: '/analytics', label: 'Analytics', moduleId: 'analytics', iconId: 'analytics' },
      {
        href: '/notifications',
        label: 'Notifications',
        moduleId: 'notifications',
        iconId: 'notifications',
        badge: 'notifications',
      },
    ],
  },
  {
    // These four are not in the spec's nav list, but each is a working, permission-gated
    // module with a real page and real endpoints. Hiding a working module is the worse
    // failure, so they get their own group instead of being dropped.
    id: 'more',
    label: 'More',
    items: [
      { href: '/accounting', label: 'Accounting', moduleId: 'accounting', iconId: 'accounting' },
      {
        href: '/revenue-analytics',
        label: 'Revenue Analytics',
        moduleId: 'revenue-analytics',
        iconId: 'revenue-analytics',
      },
      {
        href: '/workflow-builder',
        label: 'Workflow Builder',
        moduleId: 'workflow-builder',
        iconId: 'workflow-builder',
      },
      {
        href: '/agent-marketplace',
        label: 'Agent Marketplace',
        moduleId: 'agent-marketplace',
        iconId: 'agent-marketplace',
      },
    ],
  },
  {
    id: 'system',
    label: 'System',
    // One entry, not eight: the spec forbids standalone settings pages in primary nav.
    items: [{ href: '/settings', label: 'Settings', moduleId: 'settings', iconId: 'settings' }],
  },
];

export const ALL_NAV: NavItem[] = [DASHBOARD_ITEM, ...NAV_GROUPS.flatMap((g) => g.items)];

export function findNavItem(pathname: string): NavItem | undefined {
  return ALL_NAV.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
}

// Spec section 3. Every entry here must be a real route with a real, server-authorized
// behaviour behind it — the spec forbids a settings form with no backend.
//
// Deliberately absent: "Notifications preferences" and "Security / session controls".
// Neither has an API (the notifications router is list-only, and sessions are stateless
// JWT with no sessions table), so they are omitted rather than faked. Add them here in
// the same pass that adds their backend.
export interface SettingsCategory {
  href: string;
  label: string;
  description: string;
  group: string;
}

export const SETTINGS_NAV: SettingsCategory[] = [
  {
    href: '/settings/profile',
    label: 'My profile',
    description: 'Name, photo, contact details and password.',
    group: 'General',
  },
  {
    href: '/settings/organization',
    label: 'Organization',
    description: 'Company profile, timezone, currency and lead defaults.',
    group: 'General',
  },
  {
    href: '/settings/members',
    label: 'Members & invitations',
    description: 'Who has access, their role, and pending invitations.',
    group: 'Team & Access',
  },
  {
    href: '/settings/ai-providers',
    label: 'AI Providers & Models',
    description: 'Connected providers, keys, connection tests and model defaults.',
    group: 'AI Providers & Models',
  },
  {
    href: '/settings/integrations',
    label: 'Integrations',
    description: 'Presenton, ScrapLink, Diffy and object storage.',
    group: 'Integrations',
  },
  {
    href: '/settings/audit',
    label: 'Audit Log',
    description: 'Who changed what, and when.',
    group: 'Security & Audit',
  },
  {
    href: '/settings/white-label',
    label: 'White Label',
    description: 'Logo, colours and branded document assets.',
    group: 'Branding',
  },
  {
    href: '/settings/billing',
    label: 'Billing',
    description: 'Plan, subscription, invoices and payment methods.',
    group: 'Billing',
  },
];

export function isSettingsCategory(pathname: string): boolean {
  return SETTINGS_NAV.some((c) => pathname === c.href || pathname.startsWith(`${c.href}/`));
}
