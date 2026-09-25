import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { loadEnv } from '@bao/config';
import { getLogger } from './core/logging/logger.js';
import { correlationMiddleware } from './core/logging/correlation.js';
import { requestLogger } from './core/middleware/request-logger.js';
import { errorHandler } from './core/errors/handler.js';
import { healthHandler, readinessHandler } from './core/health/health.js';
import { authMiddleware } from './core/auth/jwt.js';
import { tenantMiddleware } from './core/tenancy/context.js';

import identityRoutes from './modules/identity/routes.js';
import orgRoutes from './modules/organizations/routes.js';
import accessControlRoutes from './modules/access-control/routes.js';
import knowledgeRoutes from './modules/knowledge/routes.js';
import knowledgeSearch from './modules/knowledge/search.js';
import aiAssistantRoutes from './modules/ai-assistant/routes.js';
import salesRoutes from './modules/sales/routes.js';
import proposalsRoutes from './modules/proposals/routes.js';
import presentationsRoutes from './modules/presentations/routes.js';
import intelligenceRoutes from './modules/intelligence/routes.js';
import leadIntelligenceRoutes from './modules/lead-intelligence/routes.js';
import { startAnalysisWorker, stopAnalysisWorker } from './modules/lead-intelligence/analysis-worker.js';
import notificationsRoutes from './modules/notifications/routes.js';
import dashboardRoutes from './modules/dashboard/routes.js';
import settingsRoutes from './modules/settings/routes.js';
import aiSettingsRoutes from './modules/ai-settings/routes.js';
import analyticsRoutes from './modules/analytics/routes.js';
import moduleRegistryRoutes from './modules/module-registry/routes.js';
import auditRoutes from './modules/audit/routes.js';
import billingRoutes from './modules/billing/routes.js';
import automationRoutes from './modules/automation/routes.js';
import agentMarketplaceRoutes from './modules/agent-marketplace/routes.js';
import revenueAnalyticsRoutes from './modules/revenue-analytics/routes.js';
import accountingRoutes from './modules/accounting/routes.js';
import workflowBuilderRoutes from './modules/workflow-builder/routes.js';
import whiteLabelRoutes, { publicBrandingRouter } from './modules/white-label/routes.js';

const env = loadEnv();
const log = getLogger();

const app = new Hono();

// Global middleware
app.use('*', cors({ origin: env.WEB_URL, credentials: true }));
app.use('*', correlationMiddleware());
app.use('*', requestLogger());

// Health endpoints (no auth)
app.get('/health', healthHandler);
app.get('/ready', readinessHandler);

// Public routes (login/register); /me needs a bearer token
app.use('/api/v1/identity/me', authMiddleware());
app.route('/api/v1/identity', identityRoutes);

// Public branding lookup for anonymous visitors on a white-labelled custom domain.
// MUST stay outside protectedApp — the login page has no session or org header.
app.route('/api/v1', publicBrandingRouter);

// Protected routes
const protectedApp = new Hono();
protectedApp.use('*', authMiddleware());
protectedApp.use('*', tenantMiddleware());

protectedApp.route('/organizations', orgRoutes);
protectedApp.route('/access-control', accessControlRoutes);
protectedApp.route('/knowledge', knowledgeRoutes);
protectedApp.route('/knowledge/search', knowledgeSearch);
protectedApp.route('/ai-assistant', aiAssistantRoutes);
protectedApp.route('/sales', salesRoutes);
protectedApp.route('/proposals', proposalsRoutes);
protectedApp.route('/presentations', presentationsRoutes);
protectedApp.route('/intelligence', intelligenceRoutes);
protectedApp.route('/lead-intelligence', leadIntelligenceRoutes);
protectedApp.route('/notifications', notificationsRoutes);
protectedApp.route('/dashboard', dashboardRoutes);
protectedApp.route('/settings', settingsRoutes);
protectedApp.route('/ai-settings', aiSettingsRoutes);
protectedApp.route('/analytics', analyticsRoutes);
protectedApp.route('/modules', moduleRegistryRoutes);
protectedApp.route('/audit', auditRoutes);
protectedApp.route('/billing', billingRoutes);
protectedApp.route('/automation', automationRoutes);
protectedApp.route('/agent-marketplace', agentMarketplaceRoutes);
protectedApp.route('/revenue-analytics', revenueAnalyticsRoutes);
protectedApp.route('/accounting', accountingRoutes);
protectedApp.route('/workflow-builder', workflowBuilderRoutes);
protectedApp.route('/settings/white-label', whiteLabelRoutes);

app.route('/api/v1', protectedApp);

// Error handler
app.onError(errorHandler);

const port = env.PORT;
log.info({ port }, `Business AI OS API listening on port ${port}`);

serve({ fetch: app.fetch, port });

// AI half of the lead intelligence pipeline. Started here, not in a separate service,
// because it needs the org's decrypted AI provider key.
startAnalysisWorker();

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void stopAnalysisWorker().finally(() => process.exit(0));
  });
}

export default { port, fetch: app.fetch };
