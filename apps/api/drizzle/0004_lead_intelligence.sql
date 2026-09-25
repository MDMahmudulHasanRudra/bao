CREATE TABLE "company_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"type" varchar(40) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"confidence" integer,
	"source_url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"job_id" uuid,
	"company_name" varchar(255) NOT NULL,
	"normalized_domain" varchar(255),
	"website" text,
	"country" varchar(100),
	"region" varchar(100),
	"city" varchar(100),
	"industry" varchar(100),
	"sub_industry" varchar(100),
	"employee_min" integer,
	"employee_max" integer,
	"description" text,
	"products" jsonb DEFAULT '[]'::jsonb,
	"services" jsonb DEFAULT '[]'::jsonb,
	"technologies" jsonb DEFAULT '[]'::jsonb,
	"social_links" jsonb DEFAULT '[]'::jsonb,
	"provenance" jsonb DEFAULT '{}'::jsonb,
	"score" integer,
	"score_reasons" jsonb DEFAULT '[]'::jsonb,
	"icp_match" jsonb DEFAULT '{}'::jsonb,
	"summary" text,
	"status" varchar(20) DEFAULT 'discovered' NOT NULL,
	"dedupe_status" varchar(20) DEFAULT 'possible' NOT NULL,
	"lead_id" uuid,
	"company_id" uuid,
	"contact_id" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"candidate_id" uuid,
	"document_id" uuid,
	"source_id" uuid,
	"claim" text NOT NULL,
	"snippet" text,
	"source_url" text NOT NULL,
	"retrieved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"spec" jsonb NOT NULL,
	"depth" varchar(10) DEFAULT 'standard' NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb,
	"stats" jsonb DEFAULT '{}'::jsonb,
	"usage" jsonb DEFAULT '{}'::jsonb,
	"error" text,
	"created_by" uuid NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"job_id" uuid,
	"source_type" varchar(30) NOT NULL,
	"provider" varchar(50) NOT NULL,
	"url" text NOT NULL,
	"normalized_url" text NOT NULL,
	"title" varchar(500),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"content_hash" varchar(64),
	"error" text,
	"retrieved_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"target" varchar(500),
	"attempt" integer DEFAULT 0 NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"url" text NOT NULL,
	"canonical_url" text,
	"title" varchar(500),
	"description" text,
	"headings" jsonb DEFAULT '[]'::jsonb,
	"content" text NOT NULL,
	"language" varchar(20),
	"links" jsonb DEFAULT '[]'::jsonb,
	"emails" jsonb DEFAULT '[]'::jsonb,
	"phones" jsonb DEFAULT '[]'::jsonb,
	"social_links" jsonb DEFAULT '[]'::jsonb,
	"content_hash" varchar(64) NOT NULL,
	"extracted_by" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_signals" ADD CONSTRAINT "company_signals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_signals" ADD CONSTRAINT "company_signals_candidate_id_lead_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."lead_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_candidates" ADD CONSTRAINT "lead_candidates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_candidates" ADD CONSTRAINT "lead_candidates_job_id_research_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."research_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_candidates" ADD CONSTRAINT "lead_candidates_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_candidates" ADD CONSTRAINT "lead_candidates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_candidates" ADD CONSTRAINT "lead_candidates_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_candidates" ADD CONSTRAINT "lead_candidates_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_evidence" ADD CONSTRAINT "lead_evidence_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_evidence" ADD CONSTRAINT "lead_evidence_candidate_id_lead_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."lead_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_evidence" ADD CONSTRAINT "lead_evidence_document_id_web_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."web_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_evidence" ADD CONSTRAINT "lead_evidence_source_id_research_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."research_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_jobs" ADD CONSTRAINT "research_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_jobs" ADD CONSTRAINT "research_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_job_id_research_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."research_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_tasks" ADD CONSTRAINT "research_tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_tasks" ADD CONSTRAINT "research_tasks_job_id_research_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."research_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_documents" ADD CONSTRAINT "web_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_documents" ADD CONSTRAINT "web_documents_source_id_research_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."research_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_signals_org_idx" ON "company_signals" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "company_signals_candidate_idx" ON "company_signals" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "company_signals_type_idx" ON "company_signals" USING btree ("type");--> statement-breakpoint
CREATE INDEX "lead_candidates_org_idx" ON "lead_candidates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "lead_candidates_status_idx" ON "lead_candidates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lead_candidates_job_idx" ON "lead_candidates" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_candidates_domain_uq" ON "lead_candidates" USING btree ("organization_id","normalized_domain");--> statement-breakpoint
CREATE INDEX "lead_evidence_org_idx" ON "lead_evidence" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "lead_evidence_candidate_idx" ON "lead_evidence" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "lead_evidence_source_idx" ON "lead_evidence" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "research_jobs_org_idx" ON "research_jobs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "research_jobs_status_idx" ON "research_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "research_jobs_org_created_idx" ON "research_jobs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "research_sources_org_idx" ON "research_sources" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "research_sources_job_idx" ON "research_sources" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "research_sources_url_idx" ON "research_sources" USING btree ("organization_id","normalized_url");--> statement-breakpoint
CREATE INDEX "research_sources_hash_idx" ON "research_sources" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "research_tasks_job_idx" ON "research_tasks" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "research_tasks_status_idx" ON "research_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "research_tasks_target_idx" ON "research_tasks" USING btree ("target");--> statement-breakpoint
CREATE UNIQUE INDEX "research_tasks_idempotency_uq" ON "research_tasks" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "web_documents_org_idx" ON "web_documents" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "web_documents_source_uq" ON "web_documents" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "web_documents_hash_idx" ON "web_documents" USING btree ("organization_id","content_hash");