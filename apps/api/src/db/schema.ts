import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  index,
  uniqueIndex,
  date,
} from 'drizzle-orm/pg-core';

// ============================================================
// Identity & Organizations
// ============================================================

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  logoUrl: text('logo_url'),
  settings: jsonb('settings').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  avatarUrl: text('avatar_url'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    role: varchar('role', { length: 50 }).notNull().default('member'),
    invitedBy: uuid('invited_by').references(() => users.id),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    memberships_user_org_idx: uniqueIndex('memberships_user_org_idx').on(
      t.userId,
      t.organizationId,
    ),
    memberships_org_idx: index('memberships_org_idx').on(t.organizationId),
  }),
);

// ============================================================
// Audit Log
// ============================================================

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    actorId: uuid('actor_id').references(() => users.id),
    action: varchar('action', { length: 100 }).notNull(),
    resourceType: varchar('resource_type', { length: 100 }).notNull(),
    resourceId: uuid('resource_id'),
    details: jsonb('details').$type<Record<string, unknown>>().default({}),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    audit_events_org_idx: index('audit_events_org_idx').on(t.organizationId),
    audit_events_actor_idx: index('audit_events_actor_idx').on(t.actorId),
    audit_events_created_idx: index('audit_events_created_idx').on(t.createdAt),
  }),
);

// ============================================================
// Knowledge Hub
// ============================================================

export const knowledgeSources = pgTable(
  'knowledge_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    title: varchar('title', { length: 500 }).notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    url: text('url'),
    storageKey: text('storage_key'),
    mimeType: varchar('mime_type', { length: 100 }),
    fileSize: integer('file_size'),
    visibility: varchar('visibility', { length: 50 }).notNull().default('private'),
    status: varchar('status', { length: 50 }).notNull().default('pending'),
    chunkCount: integer('chunk_count').default(0),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    knowledge_sources_org_idx: index('knowledge_sources_org_idx').on(t.organizationId),
    knowledge_sources_status_idx: index('knowledge_sources_status_idx').on(t.status),
  }),
);

export const knowledgeChunks = pgTable(
  'knowledge_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => knowledgeSources.id),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    content: text('content').notNull(),
    chunkIndex: integer('chunk_index').notNull(),
    tokenCount: integer('token_count'),
    embedding: jsonb('embedding'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    knowledge_chunks_source_idx: index('knowledge_chunks_source_idx').on(t.sourceId),
    knowledge_chunks_org_idx: index('knowledge_chunks_org_idx').on(t.organizationId),
  }),
);

// ============================================================
// AI Assistant
// ============================================================

export const aiConversations = pgTable(
  'ai_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    title: varchar('title', { length: 500 }),
    modelPolicy: jsonb('model_policy').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ai_conversations_org_idx: index('ai_conversations_org_idx').on(t.organizationId),
    ai_conversations_user_idx: index('ai_conversations_user_idx').on(t.userId),
  }),
);

export const aiMessages = pgTable(
  'ai_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => aiConversations.id),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    role: varchar('role', { length: 20 }).notNull(),
    content: text('content').notNull(),
    citations: jsonb('citations').$type<Array<Record<string, unknown>>>().default([]),
    runMetadata: jsonb('run_metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ai_messages_conversation_idx: index('ai_messages_conversation_idx').on(t.conversationId),
    ai_messages_org_idx: index('ai_messages_org_idx').on(t.organizationId),
  }),
);

// ============================================================
// Sales
// ============================================================

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: varchar('name', { length: 255 }).notNull(),
    domain: varchar('domain', { length: 255 }),
    industry: varchar('industry', { length: 100 }),
    size: varchar('size', { length: 50 }),
    notes: text('notes'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    companies_org_idx: index('companies_org_idx').on(t.organizationId),
    companies_name_idx: index('companies_name_idx').on(t.name),
  }),
);

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    companyId: uuid('company_id').references(() => companies.id),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 50 }),
    title: varchar('title', { length: 100 }),
    notes: text('notes'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    contacts_org_idx: index('contacts_org_idx').on(t.organizationId),
    contacts_company_idx: index('contacts_company_idx').on(t.companyId),
  }),
);

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    title: varchar('title', { length: 255 }).notNull(),
    stage: varchar('stage', { length: 50 }).notNull().default('new'),
    value: integer('value'),
    currency: varchar('currency', { length: 3 }).default('USD'),
    companyId: uuid('company_id').references(() => companies.id),
    contactId: uuid('contact_id').references(() => contacts.id),
    ownerId: uuid('owner_id').references(() => users.id),
    expectedCloseDate: timestamp('expected_close_date', { withTimezone: true }),
    notes: text('notes'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    leads_org_idx: index('leads_org_idx').on(t.organizationId),
    leads_stage_idx: index('leads_stage_idx').on(t.stage),
    leads_owner_idx: index('leads_owner_idx').on(t.ownerId),
  }),
);

export const activities = pgTable(
  'activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    leadId: uuid('lead_id').references(() => leads.id),
    contactId: uuid('contact_id').references(() => contacts.id),
    companyId: uuid('company_id').references(() => companies.id),
    type: varchar('type', { length: 50 }).notNull(),
    subject: varchar('subject', { length: 255 }).notNull(),
    body: text('body'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    activities_org_idx: index('activities_org_idx').on(t.organizationId),
    activities_lead_idx: index('activities_lead_idx').on(t.leadId),
  }),
);

// ============================================================
// Proposals
// ============================================================

export const proposalTemplates = pgTable(
  'proposal_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: varchar('name', { length: 255 }).notNull(),
    content: text('content').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ proposal_templates_org_idx: index('proposal_templates_org_idx').on(t.organizationId) }),
);

export const proposals = pgTable(
  'proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    leadId: uuid('lead_id').references(() => leads.id),
    templateId: uuid('template_id').references(() => proposalTemplates.id),
    title: varchar('title', { length: 255 }).notNull(),
    content: text('content'),
    status: varchar('status', { length: 50 }).notNull().default('draft'),
    version: integer('version').default(1),
    exportedUrl: text('exported_url'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    proposals_org_idx: index('proposals_org_idx').on(t.organizationId),
    proposals_status_idx: index('proposals_status_idx').on(t.status),
  }),
);

// ============================================================
// Presentations
// ============================================================

export const presentations = pgTable(
  'presentations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    proposalId: uuid('proposal_id').references(() => proposals.id),
    title: varchar('title', { length: 255 }).notNull(),
    providerJobId: varchar('provider_job_id', { length: 255 }),
    status: varchar('status', { length: 50 }).notNull().default('pending'),
    outputUrl: text('output_url'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    presentations_org_idx: index('presentations_org_idx').on(t.organizationId),
    presentations_status_idx: index('presentations_status_idx').on(t.status),
  }),
);

// ============================================================
// Intelligence
// ============================================================

export const monitoringTargets = pgTable(
  'monitoring_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    config: jsonb('config').$type<Record<string, unknown>>().notNull(),
    policy: jsonb('policy').$type<Record<string, unknown>>().default({}),
    enabled: boolean('enabled').default(true),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ monitoring_targets_org_idx: index('monitoring_targets_org_idx').on(t.organizationId) }),
);

export const intelligenceEvents = pgTable(
  'intelligence_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    targetId: uuid('target_id')
      .notNull()
      .references(() => monitoringTargets.id),
    title: varchar('title', { length: 500 }).notNull(),
    content: text('content'),
    sourceUrl: text('source_url'),
    classification: varchar('classification', { length: 50 }),
    reviewed: boolean('reviewed').default(false),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    intelligence_events_org_idx: index('intelligence_events_org_idx').on(t.organizationId),
    intelligence_events_target_idx: index('intelligence_events_target_idx').on(t.targetId),
  }),
);

// ============================================================
// AI Provider & Model Settings
// ============================================================

export const aiProviders = pgTable(
  'ai_providers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    provider: varchar('provider', { length: 50 }).notNull(),
    label: varchar('label', { length: 255 }),
    baseUrl: text('base_url'),
    encryptedKey: text('encrypted_key').notNull(),
    keySuffix: varchar('key_suffix', { length: 16 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    lastTestedAt: timestamp('last_tested_at', { withTimezone: true }),
    lastTestResult: varchar('last_test_result', { length: 20 }),
    lastTestError: text('last_test_error'),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ai_providers_org_idx: index('ai_providers_org_idx').on(t.organizationId),
    ai_providers_org_provider_idx: uniqueIndex('ai_providers_org_provider_idx').on(
      t.organizationId,
      t.provider,
    ),
  }),
);

export const aiModelDefaults = pgTable(
  'ai_model_defaults',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    capability: varchar('capability', { length: 50 }).notNull(),
    provider: varchar('provider', { length: 50 }).notNull(),
    modelId: varchar('model_id', { length: 255 }).notNull(),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ai_model_defaults_org_idx: index('ai_model_defaults_org_idx').on(t.organizationId),
    ai_model_defaults_org_cap_idx: uniqueIndex('ai_model_defaults_org_cap_idx').on(
      t.organizationId,
      t.capability,
    ),
  }),
);

// ============================================================
// Notifications
// ============================================================

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    type: varchar('type', { length: 50 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    body: text('body'),
    link: text('link'),
    readAt: timestamp('read_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    notifications_org_idx: index('notifications_org_idx').on(t.organizationId),
    notifications_user_idx: index('notifications_user_idx').on(t.userId),
    notifications_read_idx: index('notifications_read_idx').on(t.readAt),
  }),
);

// ============================================================
// Invites
// ============================================================

export const invites = pgTable(
  'invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    email: varchar('email', { length: 255 }).notNull(),
    role: varchar('role', { length: 50 }).notNull(),
    token: varchar('token', { length: 64 }).notNull().unique(),
    invitedBy: uuid('invited_by').references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    invites_org_idx: index('invites_org_idx').on(t.organizationId),
    invites_email_idx: index('invites_email_idx').on(t.email),
  }),
);

// ============================================================
// Proposal Versions
// ============================================================

export const proposalVersions = pgTable(
  'proposal_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => proposals.id),
    version: integer('version').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    content: text('content'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => ({
    proposal_versions_proposal_idx: index('proposal_versions_proposal_idx').on(t.proposalId),
    proposal_versions_unique: uniqueIndex('proposal_versions_proposal_version_idx').on(
      t.proposalId,
      t.version,
    ),
  }),
);

// ============================================================
// Billing
// ============================================================

export const billingPlans = pgTable(
  'billing_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    priceCents: integer('price_cents').notNull(),
    currency: varchar('currency', { length: 3 }).default('USD'),
    interval: varchar('interval', { length: 20 }).notNull(),
    features: jsonb('features').$type<string[]>().default([]),
    limits: jsonb('limits').$type<Record<string, unknown>>().default({}),
    stripePriceId: varchar('stripe_price_id', { length: 255 }),
    isActive: boolean('is_active').default(true),
    sortOrder: integer('sort_order').default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    billing_plans_org_idx: index('billing_plans_org_idx').on(t.organizationId),
    billing_plans_active_idx: index('billing_plans_active_idx').on(t.isActive),
  }),
);

export const billingSubscriptions = pgTable(
  'billing_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    planId: uuid('plan_id')
      .notNull()
      .references(() => billingPlans.id),
    status: varchar('status', { length: 20 }).notNull().default('trial'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true })
      .defaultNow()
      .notNull(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
    stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    billing_subscriptions_org_idx: index('billing_subscriptions_org_idx').on(t.organizationId),
    billing_subscriptions_status_idx: index('billing_subscriptions_status_idx').on(t.status),
    billing_subscriptions_stripe_idx: uniqueIndex('billing_subscriptions_stripe_idx').on(
      t.stripeSubscriptionId,
    ),
  }),
);

export const billingInvoices = pgTable(
  'billing_invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => billingSubscriptions.id),
    planId: uuid('plan_id')
      .notNull()
      .references(() => billingPlans.id),
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    amountCents: integer('amount_cents').notNull(),
    currency: varchar('currency', { length: 3 }).default('USD'),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    stripeInvoiceId: varchar('stripe_invoice_id', { length: 255 }),
    pdfUrl: text('pdf_url'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    billing_invoices_org_idx: index('billing_invoices_org_idx').on(t.organizationId),
    billing_invoices_subscription_idx: index('billing_invoices_subscription_idx').on(
      t.subscriptionId,
    ),
    billing_invoices_status_idx: index('billing_invoices_status_idx').on(t.status),
  }),
);

export const billingPaymentMethods = pgTable(
  'billing_payment_methods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    type: varchar('type', { length: 20 }).notNull(),
    provider: varchar('provider', { length: 20 }).notNull(),
    providerPaymentMethodId: varchar('provider_payment_method_id', { length: 255 }).notNull(),
    last4: varchar('last4', { length: 4 }),
    brand: varchar('brand', { length: 50 }),
    expMonth: integer('exp_month'),
    expYear: integer('exp_year'),
    isDefault: boolean('is_default').default(false),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    billing_payment_methods_org_idx: index('billing_payment_methods_org_idx').on(t.organizationId),
    billing_payment_methods_user_idx: index('billing_payment_methods_user_idx').on(t.userId),
    billing_payment_methods_provider_idx: uniqueIndex('billing_payment_methods_provider_idx').on(
      t.provider,
      t.providerPaymentMethodId,
    ),
  }),
);

export const billingUsageRecords = pgTable(
  'billing_usage_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => billingSubscriptions.id),
    metric: varchar('metric', { length: 50 }).notNull(),
    quantity: integer('quantity').notNull().default(0),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    billing_usage_org_idx: index('billing_usage_org_idx').on(t.organizationId),
    billing_usage_subscription_idx: index('billing_usage_subscription_idx').on(t.subscriptionId),
    billing_usage_metric_idx: index('billing_usage_metric_idx').on(t.metric),
  }),
);

// ============================================================
// Automation
// ============================================================

export const automationWorkflows = pgTable(
  'automation_workflows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    trigger: jsonb('trigger').$type<Record<string, unknown>>().notNull(),
    conditions: jsonb('conditions').$type<Record<string, unknown>>().default({}),
    actions: jsonb('actions').$type<Array<Record<string, unknown>>>().default([]),
    enabled: boolean('enabled').default(true),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    runCount: integer('run_count').default(0),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    automation_workflows_org_idx: index('automation_workflows_org_idx').on(t.organizationId),
    automation_workflows_enabled_idx: index('automation_workflows_enabled_idx').on(t.enabled),
  }),
);

export const automationRuns = pgTable(
  'automation_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => automationWorkflows.id),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    triggerData: jsonb('trigger_data').$type<Record<string, unknown>>().default({}),
    result: jsonb('result').$type<Record<string, unknown>>().default({}),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    automation_runs_org_idx: index('automation_runs_org_idx').on(t.organizationId),
    automation_runs_workflow_idx: index('automation_runs_workflow_idx').on(t.workflowId),
    automation_runs_status_idx: index('automation_runs_status_idx').on(t.status),
  }),
);

// ============================================================
// Agent Marketplace
// ============================================================

export const marketplaceAgents = pgTable(
  'marketplace_agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    category: varchar('category', { length: 50 }).notNull(),
    capabilities: jsonb('capabilities').$type<string[]>().default([]),
    configSchema: jsonb('config_schema').$type<Record<string, unknown>>().default({}),
    pricing: varchar('pricing', { length: 20 }).notNull().default('free'),
    priceCents: integer('price_cents').default(0),
    currency: varchar('currency', { length: 3 }).default('USD'),
    publisherId: uuid('publisher_id').references(() => users.id),
    version: varchar('version', { length: 50 }).notNull().default('1.0.0'),
    status: varchar('status', { length: 20 }).notNull().default('published'),
    iconUrl: text('icon_url'),
    readmeUrl: text('readme_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    marketplace_agents_org_idx: index('marketplace_agents_org_idx').on(t.organizationId),
    marketplace_agents_category_idx: index('marketplace_agents_category_idx').on(t.category),
    marketplace_agents_status_idx: index('marketplace_agents_status_idx').on(t.status),
  }),
);
export const marketplaceInstallations = pgTable(
  'marketplace_installations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => marketplaceAgents.id),
    config: jsonb('config').$type<Record<string, unknown>>().default({}),
    status: varchar('status', { length: 20 }).notNull().default('installed'),
    installedBy: uuid('installed_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    marketplace_installations_org_idx: index('marketplace_installations_org_idx').on(
      t.organizationId,
    ),
    marketplace_installations_agent_idx: index('marketplace_installations_agent_idx').on(t.agentId),
    marketplace_installations_status_idx: index('marketplace_installations_status_idx').on(
      t.status,
    ),
    marketplace_installations_org_agent_unique: uniqueIndex(
      'marketplace_installations_org_agent_unique',
    ).on(t.organizationId, t.agentId),
  }),
);

export const marketplaceReviews = pgTable(
  'marketplace_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => marketplaceAgents.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    marketplace_reviews_org_idx: index('marketplace_reviews_org_idx').on(t.organizationId),
    marketplace_reviews_agent_idx: index('marketplace_reviews_agent_idx').on(t.agentId),
    marketplace_reviews_user_idx: index('marketplace_reviews_user_idx').on(t.userId),
    marketplace_reviews_org_agent_user_unique: uniqueIndex(
      'marketplace_reviews_org_agent_user_unique',
    ).on(t.organizationId, t.agentId, t.userId),
  }),
);

// ============================================================
// Revenue Analytics
// ============================================================

export const revenueMetrics = pgTable(
  'revenue_metrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    date: date('date').notNull(),
    mrr: integer('mrr').notNull().default(0),
    arr: integer('arr').notNull().default(0),
    newMrr: integer('new_mrr').notNull().default(0),
    expansionMrr: integer('expansion_mrr').notNull().default(0),
    contractionMrr: integer('contraction_mrr').notNull().default(0),
    churnedMrr: integer('churned_mrr').notNull().default(0),
    totalCustomers: integer('total_customers').notNull().default(0),
    newCustomers: integer('new_customers').notNull().default(0),
    churnedCustomers: integer('churned_customers').notNull().default(0),
    arpu: integer('arpu').notNull().default(0),
    ltv: integer('ltv').notNull().default(0),
    cac: integer('cac').notNull().default(0),
    paybackPeriod: integer('payback_period').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    revenue_metrics_org_idx: index('revenue_metrics_org_idx').on(t.organizationId),
    revenue_metrics_date_idx: index('revenue_metrics_date_idx').on(t.date),
    revenue_metrics_org_date_unique: uniqueIndex('revenue_metrics_org_date_unique').on(
      t.organizationId,
      t.date,
    ),
  }),
);
export const revenueForecast = pgTable(
  'revenue_forecast',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    forecastDate: date('forecast_date').notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    predictedMrr: integer('predicted_mrr').notNull(),
    predictedArr: integer('predicted_arr').notNull(),
    confidenceLower: integer('confidence_lower'),
    confidenceUpper: integer('confidence_upper'),
    modelVersion: varchar('model_version', { length: 50 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    revenue_forecast_org_idx: index('revenue_forecast_org_idx').on(t.organizationId),
    revenue_forecast_date_idx: index('revenue_forecast_date_idx').on(t.forecastDate),
  }),
);

export const cohortRetention = pgTable(
  'cohort_retention',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    cohortMonth: date('cohort_month').notNull(),
    periodNumber: integer('period_number').notNull(),
    customersCount: integer('customers_count').notNull().default(0),
    retainedCount: integer('retained_count').notNull().default(0),
    revenueRetained: integer('revenue_retained').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cohort_retention_org_idx: index('cohort_retention_org_idx').on(t.organizationId),
    cohort_retention_cohort_idx: index('cohort_retention_cohort_idx').on(t.cohortMonth),
  }),
);
// ============================================================

export const accountingAccounts = pgTable(
  'accounting_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    code: varchar('code', { length: 20 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 20 }).notNull(), // asset, liability, equity, revenue, expense
    parentId: uuid('parent_id'),
    balance: integer('balance').notNull().default(0), // in cents
    currency: varchar('currency', { length: 3 }).default('USD'),
    isActive: boolean('is_active').default(true),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    accounting_accounts_org_idx: index('accounting_accounts_org_idx').on(t.organizationId),
    accounting_accounts_code_idx: uniqueIndex('accounting_accounts_code_idx').on(
      t.organizationId,
      t.code,
    ),
  }),
);
export const accountingJournalEntries = pgTable(
  'accounting_journal_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    entryNumber: varchar('entry_number', { length: 50 }).notNull(),
    date: date('date').notNull(),
    description: text('description'),
    status: varchar('status', { length: 20 }).notNull().default('draft'), // draft, posted, void
    reference: varchar('reference', { length: 100 }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    postedBy: uuid('posted_by').references(() => users.id),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    accounting_journal_entries_org_idx: index('accounting_journal_entries_org_idx').on(
      t.organizationId,
    ),
    accounting_journal_entries_number_idx: uniqueIndex('accounting_journal_entries_number_idx').on(
      t.organizationId,
      t.entryNumber,
    ),
    accounting_journal_entries_date_idx: index('accounting_journal_entries_date_idx').on(t.date),
    accounting_journal_entries_status_idx: index('accounting_journal_entries_status_idx').on(
      t.status,
    ),
  }),
);
export const accountingJournalLines = pgTable(
  'accounting_journal_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => accountingJournalEntries.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accountingAccounts.id),
    debit: integer('debit').notNull().default(0), // in cents
    credit: integer('credit').notNull().default(0), // in cents
    description: text('description'),
    sortOrder: integer('sort_order').default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    accounting_journal_lines_entry_idx: index('accounting_journal_lines_entry_idx').on(t.entryId),
    accounting_journal_lines_account_idx: index('accounting_journal_lines_account_idx').on(
      t.accountId,
    ),
  }),
);
export const accountingTaxRates = pgTable(
  'accounting_tax_rates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: varchar('name', { length: 100 }).notNull(),
    rate: integer('rate').notNull(), // basis points (e.g., 1000 = 10%)
    appliesTo: varchar('applies_to', { length: 20 }).notNull().default('both'), // sales, purchases, both
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    accounting_tax_rates_org_idx: index('accounting_tax_rates_org_idx').on(t.organizationId),
  }),
);

export const accountingInvoices = pgTable(
  'accounting_invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    invoiceNumber: varchar('invoice_number', { length: 50 }).notNull(),
    date: date('date').notNull(),
    dueDate: date('due_date'),
    customerId: uuid('customer_id').references(() => users.id),
    status: varchar('status', { length: 20 }).notNull().default('draft'), // draft, sent, paid, void
    subtotal: integer('subtotal').notNull().default(0),
    taxAmount: integer('tax_amount').notNull().default(0),
    total: integer('total').notNull().default(0),
    currency: varchar('currency', { length: 3 }).default('USD'),
    notes: text('notes'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    accounting_invoices_org_idx: index('accounting_invoices_org_idx').on(t.organizationId),
    accounting_invoices_number_idx: uniqueIndex('accounting_invoices_number_idx').on(
      t.organizationId,
      t.invoiceNumber,
    ),
    accounting_invoices_status_idx: index('accounting_invoices_status_idx').on(t.status),
  }),
);
export const accountingPayments = pgTable(
  'accounting_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    paymentNumber: varchar('payment_number', { length: 50 }).notNull(),
    date: date('date').notNull(),
    amount: integer('amount').notNull(),
    currency: varchar('currency', { length: 3 }).default('USD'),
    paymentMethod: varchar('payment_method', { length: 20 }),
    reference: varchar('reference', { length: 100 }),
    status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, completed, failed
    invoiceId: uuid('invoice_id').references(() => accountingInvoices.id),
    journalEntryId: uuid('journal_entry_id').references(() => accountingJournalEntries.id),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    accounting_payments_org_idx: index('accounting_payments_org_idx').on(t.organizationId),
    accounting_payments_number_idx: uniqueIndex('accounting_payments_number_idx').on(
      t.organizationId,
      t.paymentNumber,
    ),
    accounting_payments_status_idx: index('accounting_payments_status_idx').on(t.status),
  }),
);

// ============================================================
// Workflow Builder
// ============================================================

export const workflowDefinitions = pgTable(
  'workflow_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    nodes: jsonb('nodes')
      .$type<
        Array<{
          id: string;
          type: 'trigger' | 'action' | 'condition' | 'delay' | 'webhook';
          position: { x: number; y: number };
          config: Record<string, unknown>;
        }>
      >()
      .notNull()
      .default([]),
    edges: jsonb('edges')
      .$type<
        Array<{
          id: string;
          source: string;
          target: string;
          sourceHandle?: string;
          targetHandle?: string;
        }>
      >()
      .notNull()
      .default([]),
    version: integer('version').default(1),
    isActive: boolean('is_active').default(false),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    workflow_definitions_org_idx: index('workflow_definitions_org_idx').on(t.organizationId),
    workflow_definitions_active_idx: index('workflow_definitions_active_idx').on(t.isActive),
  }),
);

export const workflowExecutions = pgTable(
  'workflow_executions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    definitionId: uuid('definition_id')
      .notNull()
      .references(() => workflowDefinitions.id),
    status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, running, completed, failed, cancelled
    inputData: jsonb('input_data').$type<Record<string, unknown>>().default({}),
    outputData: jsonb('output_data').$type<Record<string, unknown>>().default({}),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    workflow_executions_org_idx: index('workflow_executions_org_idx').on(t.organizationId),
    workflow_executions_definition_idx: index('workflow_executions_definition_idx').on(
      t.definitionId,
    ),
    workflow_executions_status_idx: index('workflow_executions_status_idx').on(t.status),
  }),
);

export const workflowStepRuns = pgTable(
  'workflow_step_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    executionId: uuid('execution_id')
      .notNull()
      .references(() => workflowExecutions.id),
    nodeId: varchar('node_id', { length: 100 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, running, completed, failed, skipped
    inputData: jsonb('input_data').$type<Record<string, unknown>>().default({}),
    outputData: jsonb('output_data').$type<Record<string, unknown>>().default({}),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    workflow_step_runs_org_idx: index('workflow_step_runs_org_idx').on(t.organizationId),
    workflow_step_runs_execution_idx: index('workflow_step_runs_execution_idx').on(t.executionId),
    workflow_step_runs_node_idx: index('workflow_step_runs_node_idx').on(t.nodeId),
    workflow_step_runs_status_idx: index('workflow_step_runs_status_idx').on(t.status),
  }),
);

export const whiteLabelSettings = pgTable(
  'white_label_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    productName: varchar('product_name', { length: 120 }),
    tagline: varchar('tagline', { length: 200 }),
    logoKey: text('logo_key'),
    faviconKey: text('favicon_key'),
    loginBackgroundKey: text('login_background_key'),
    primaryColor: varchar('primary_color', { length: 9 }),
    secondaryColor: varchar('secondary_color', { length: 9 }),
    fontFamily: varchar('font_family', { length: 100 }),
    customDomain: varchar('custom_domain', { length: 255 }),
    emailFromName: varchar('email_from_name', { length: 120 }),
    emailReplyTo: varchar('email_reply_to', { length: 255 }),
    termsUrl: varchar('terms_url', { length: 500 }),
    privacyUrl: varchar('privacy_url', { length: 500 }),
    updatedBy: uuid('updated_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // one branding record per org — this is what makes the upsert safe
    white_label_settings_org_uq: uniqueIndex('white_label_settings_org_uq').on(t.organizationId),
    // public /branding resolves an org from the request Host header, so a domain
    // must belong to at most one org. Postgres allows many NULLs, so unset is fine.
    white_label_settings_domain_uq: uniqueIndex('white_label_settings_domain_uq').on(
      t.customDomain,
    ),
  }),
);
