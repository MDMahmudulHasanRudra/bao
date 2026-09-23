// API Response Types
export interface ApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    correlationId?: string;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    correlationId?: string;
  };
}

// Identity
export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

export interface Membership {
  id: string;
  role: string;
  organizationId: string;
  orgName: string;
  orgSlug: string;
}

// Organizations
export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  settings?: Record<string, unknown>;
  createdAt: string;
}

// Knowledge
export type KnowledgeSourceType = 'file' | 'url' | 'text';
export type KnowledgeVisibility = 'private' | 'team' | 'public';
export type KnowledgeStatus = 'pending' | 'processing' | 'ready' | 'error';

export interface KnowledgeSource {
  id: string;
  organizationId: string;
  title: string;
  type: KnowledgeSourceType;
  visibility: KnowledgeVisibility;
  status: KnowledgeStatus;
  chunkCount: number;
  uploadedBy: string;
  createdAt: string;
}

// AI Assistant
export interface AiConversation {
  id: string;
  organizationId: string;
  title?: string;
  createdAt: string;
}

export interface AiMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: Citation[];
  createdAt: string;
}

export interface Citation {
  sourceId: string;
  chunkId: string;
  title: string;
  content: string;
  score: number;
}

// Sales
export type LeadStage =
  'new' | 'qualified' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';

export interface Company {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  createdAt: string;
}

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  companyId?: string;
  createdAt: string;
}

export interface Lead {
  id: string;
  title: string;
  stage: LeadStage;
  value?: number;
  currency: string;
  companyId?: string;
  contactId?: string;
  ownerId?: string;
  expectedCloseDate?: string;
  createdAt: string;
}

export interface Activity {
  id: string;
  type: string;
  subject: string;
  body?: string;
  dueAt?: string;
  completedAt?: string;
  userId: string;
  createdAt: string;
}

// Proposals
export type ProposalStatus = 'draft' | 'review' | 'approved' | 'sent' | 'accepted' | 'rejected';

export interface Proposal {
  id: string;
  title: string;
  status: ProposalStatus;
  version: number;
  leadId?: string;
  templateId?: string;
  createdBy: string;
  createdAt: string;
}

export interface ProposalTemplate {
  id: string;
  name: string;
  content: string;
  createdAt: string;
}

// Presentations
export type PresentationStatus = 'pending' | 'generating' | 'ready' | 'error';

export interface Presentation {
  id: string;
  title: string;
  status: PresentationStatus;
  proposalId?: string;
  outputUrl?: string;
  requestedBy: string;
  createdAt: string;
}

// Intelligence
export interface MonitoringTarget {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
}

export interface IntelligenceEvent {
  id: string;
  targetId: string;
  title: string;
  content?: string;
  sourceUrl?: string;
  classification?: string;
  reviewed: boolean;
  createdAt: string;
}

// Notifications
export interface Notification {
  id: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  readAt?: string;
  createdAt: string;
}
