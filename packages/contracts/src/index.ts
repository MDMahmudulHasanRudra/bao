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

// ============================================================
// Lead Intelligence
// ============================================================

export type ResearchDepth = 'light' | 'standard' | 'deep';

/** Validated output of the Discovery Planner. Every field is optional except `limit`. */
export interface DiscoverySpecification {
  objective?: string;
  geography?: string[];
  industries?: string[];
  subIndustries?: string[];
  companySize?: { min?: number; max?: number };
  revenueRange?: { min?: number; max?: number; currency?: string };
  technologies?: string[];
  businessModels?: string[];
  targetService?: string;
  keywords?: string[];
  targetSignals?: string[];
  customCriteria?: string[];
  /** Domains the user already knows about; discovery starts from these. */
  seedDomains?: string[];
  /** Domains that must never be researched. */
  excludeDomains?: string[];
  /** BCP-47 locale hints, e.g. 'en-GB'. */
  locales?: string[];
  /** Hard cap on companies researched per job. */
  limit: number;
}

/** Section 9: a failed plan is reported, never silently replaced with a guess. */
export type DiscoveryPlanResult =
  | { status: 'success'; specification: DiscoverySpecification }
  | { status: 'validation_error'; message: string }
  | { status: 'unconfigured'; message: string };

export type ResearchJobStatus =
  | 'queued'
  | 'discovering'
  | 'analyzing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type LeadCandidateStatus =
  | 'discovered'
  | 'researching'
  | 'analyzed'
  | 'qualified'
  | 'review_required'
  | 'approved'
  | 'rejected'
  | 'imported';

export interface ResearchJobProgress {
  discovered: number;
  processed: number;
  qualified: number;
  rejected: number;
  failed: number;
  total: number;
}

export interface ResearchJobStats {
  companiesDiscovered: number;
  candidatesFound: number;
  pagesCrawled: number;
  aiCalls: number;
  errors: number;
}

export interface ResearchJob {
  id: string;
  organizationId: string;
  name: string;
  status: ResearchJobStatus;
  spec: DiscoverySpecification;
  depth: ResearchDepth;
  /** nullable at the type level because the column has a DB default; never null in practice. */
  progress: ResearchJobProgress | null;
  stats: ResearchJobStats | null;
  /** Named `error` to match the column, so the Drizzle row satisfies this shape. */
  error?: string | null;
  createdBy: string;
  startedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
}

export interface LeadCandidate {
  id: string;
  jobId?: string;
  companyName: string;
  normalizedDomain?: string;
  website?: string;
  country?: string;
  region?: string;
  city?: string;
  industry?: string;
  subIndustry?: string;
  employeeMin?: number;
  employeeMax?: number;
  description?: string;
  products: string[];
  services: string[];
  technologies: string[];
  socialLinks: string[];
  score?: number;
  scoreReasons: string[];
  /** criterion -> 'match' | 'unknown' | 'no_match'. Unknown is always allowed. */
  icpMatch: Record<string, string>;
  summary?: string;
  status: LeadCandidateStatus;
  leadId?: string;
  companyId?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface CompanySignal {
  id: string;
  candidateId: string;
  type: string;
  title: string;
  description?: string;
  confidence?: number;
  sourceUrl?: string;
  detectedAt: string;
}

export interface LeadEvidence {
  id: string;
  candidateId?: string;
  documentId?: string;
  claim: string;
  snippet?: string;
  sourceUrl: string;
  retrievedAt?: string;
}

export interface CreateResearchJobRequest {
  name?: string;
  /** Natural language request; parsed into a DiscoverySpecification when `spec` is absent. */
  request?: string;
  spec?: DiscoverySpecification;
  depth?: ResearchDepth;
}

export interface LeadIntelligenceSummary {
  jobs: number;
  activeJobs: number;
  companiesDiscovered: number;
  candidates: number;
  qualified: number;
  approved: number;
  imported: number;
  recentSignals: CompanySignal[];
}

// ============================================================
// Provider abstractions
// Business logic depends on these interfaces, never on a vendor.
// ============================================================

export interface SearchOptions {
  page?: number;
  limit?: number;
  country?: string;
  language?: string;
  safeSearch?: boolean;
}

/** Normalized so no caller can depend on a provider's response shape. */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  rank: number;
}

export interface SearchProvider {
  readonly id: string;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}

/** Normalized web document (§18). */
export interface WebDocumentData {
  url: string;
  canonicalUrl?: string;
  title?: string;
  description?: string;
  headings: string[];
  content: string;
  language?: string;
  links: string[];
  emails: string[];
  phones: string[];
  socialLinks: string[];
  contentHash: string;
  sourceType: 'website';
  status: 'success' | 'failed' | 'blocked';
  retrievedAt: string;
  error?: string;
  /** The provider that actually produced this document, for honest provenance. */
  provider?: string;
}

export interface CrawlOptions {
  depth: number;
  maxPages: number;
  maxPagesPerDomain: number;
  timeoutMs: number;
  maxResponseBytes: number;
  respectRobots: boolean;
  userAgent: string;
}

export interface CrawlerProvider {
  readonly id: string;
  /** Never bypasses auth, CAPTCHAs, paywalls, or anti-bot controls. */
  fetch(url: string, options?: Partial<CrawlOptions>): Promise<WebDocumentData>;
  crawl(url: string, options: Partial<CrawlOptions>): Promise<WebDocumentData[]>;
}

export interface EnrichmentRequest {
  domain: string;
  name?: string;
  country?: string;
}

export interface EnrichmentResult {
  provider: string;
  industry?: string;
  subIndustry?: string;
  employeeMin?: number;
  employeeMax?: number;
  country?: string;
  region?: string;
  city?: string;
  description?: string;
  technologies: string[];
  sourceUrl?: string;
  retrievedAt: string;
}

export interface EnrichmentProvider {
  readonly id: string;
  enrich(request: EnrichmentRequest): Promise<EnrichmentResult>;
}
