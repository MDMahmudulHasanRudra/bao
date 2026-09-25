import { Hono } from 'hono';
import { getTenant } from '../../core/tenancy/context.js';

interface ModuleConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  comingSoon: boolean;
  uiAvailable: boolean;
  icon?: string;
}

export const MODULE_REGISTRY: ModuleConfig[] = [
  {
    id: 'dashboard',
    name: 'Dashboard',
    description: 'Overview and quick actions',
    enabled: true,
    comingSoon: false,
    uiAvailable: true,
  },
  {
    id: 'knowledge',
    name: 'Knowledge Hub',
    description: 'Company knowledge base and RAG',
    enabled: true,
    comingSoon: false,
    uiAvailable: true,
  },
  {
    id: 'ai-assistant',
    name: 'AI Assistant',
    description: 'AI-powered chat and assistance',
    enabled: true,
    comingSoon: false,
    uiAvailable: true,
  },
  {
    id: 'sales',
    name: 'Sales',
    description: 'CRM, pipeline, and lead management',
    enabled: true,
    comingSoon: false,
    uiAvailable: true,
  },
  {
    id: 'proposals',
    name: 'Proposals',
    description: 'Proposal creation and management',
    enabled: true,
    comingSoon: false,
    uiAvailable: true,
  },
  {
    id: 'presentations',
    name: 'Presentations',
    description: 'AI-generated presentations',
    enabled: true,
    comingSoon: false,
    uiAvailable: true,
  },
  {
    id: 'intelligence',
    name: 'Intelligence',
    description: 'Web monitoring and competitive intelligence',
    enabled: true,
    comingSoon: false,
    uiAvailable: true,
  },
  {
    id: 'lead-intelligence',
    name: 'Lead Intelligence',
    description: 'Discover and qualify companies against your ICP',
    enabled: true,
    comingSoon: false,
    uiAvailable: true,
  },
  {
    id: 'notifications',
    name: 'Notifications',
    description: 'Alerts and notifications',
    enabled: true,
    comingSoon: false,
    uiAvailable: true,
  },
  {
    id: 'analytics',
    name: 'Analytics',
    description: 'Business analytics and reporting',
    enabled: true,
    comingSoon: false,
    uiAvailable: true,
  },
  {
    id: 'settings',
    name: 'Settings',
    description: 'Organization and user settings',
    enabled: true,
    comingSoon: false,
    uiAvailable: true,
  },
  {
    id: 'automation',
    name: 'Automation',
    description: 'CRM automation sequences',
    enabled: true,
    comingSoon: false,
    uiAvailable: true,
  },
  {
    id: 'agent-marketplace',
    name: 'Agent Marketplace',
    description: 'AI agent marketplace',
    enabled: true,
    comingSoon: false,
    uiAvailable: true,
  },
  {
    id: 'revenue-analytics',
    name: 'Revenue Analytics',
    description: 'Advanced revenue analytics',
    enabled: true,
    comingSoon: false,
    uiAvailable: true,
  },
  {
    id: 'accounting',
    name: 'Accounting',
    description: 'Native accounting integration',
    enabled: true,
    comingSoon: false,
    uiAvailable: true,
  },
  {
    id: 'mobile',
    name: 'Mobile Apps',
    description: 'iOS and Android apps',
    enabled: false,
    comingSoon: true,
    uiAvailable: false,
  },
  {
    id: 'workflow-builder',
    name: 'Workflow Builder',
    description: 'Custom workflow builder',
    enabled: true,
    comingSoon: false,
    uiAvailable: true,
  },
  {
    id: 'white-label',
    name: 'White Labeling',
    description: 'White-label customization',
    enabled: true,
    comingSoon: false,
    uiAvailable: true,
  },
  {
    id: 'billing',
    name: 'Billing',
    description: 'Subscription and billing management',
    enabled: true,
    comingSoon: false,
    uiAvailable: true,
  },
  {
    id: 'api-marketplace',
    name: 'API Marketplace',
    description: 'Public API marketplace',
    enabled: false,
    comingSoon: true,
    uiAvailable: false,
  },
];

const moduleRegistry = new Hono();

moduleRegistry.get('/', async (c) => {
  const tenant = getTenant(c);

  // Filter modules based on role permissions
  const accessibleModules = MODULE_REGISTRY.filter((mod) => {
    if (!mod.enabled) return false;
    // Basic role-based filtering
    if (tenant.role === 'viewer' && ['settings', 'analytics'].includes(mod.id)) return false;
    return true;
  });

  return c.json({
    modules: accessibleModules,
    comingSoon: MODULE_REGISTRY.filter((m) => m.comingSoon),
  });
});

moduleRegistry.get('/:id', async (c) => {
  const moduleId = c.req.param('id');
  const mod = MODULE_REGISTRY.find((m) => m.id === moduleId);
  if (!mod) return c.json({ error: 'Module not found' }, 404);
  return c.json({ module: mod });
});

export default moduleRegistry;
