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
