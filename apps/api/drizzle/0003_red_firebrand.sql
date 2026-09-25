CREATE TABLE "accounting_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(20) NOT NULL,
	"parent_id" uuid,
	"balance" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'USD',
	"is_active" boolean DEFAULT true,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounting_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_number" varchar(50) NOT NULL,
	"date" date NOT NULL,
	"due_date" date,
	"customer_id" uuid,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"tax_amount" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'USD',
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounting_journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entry_number" varchar(50) NOT NULL,
	"date" date NOT NULL,
	"description" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"reference" varchar(100),
	"created_by" uuid NOT NULL,
	"posted_by" uuid,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounting_journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"debit" integer DEFAULT 0 NOT NULL,
	"credit" integer DEFAULT 0 NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounting_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"payment_number" varchar(50) NOT NULL,
	"date" date NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'USD',
	"payment_method" varchar(20),
	"reference" varchar(100),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"invoice_id" uuid,
	"journal_entry_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounting_tax_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"rate" integer NOT NULL,
	"applies_to" varchar(20) DEFAULT 'both' NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"trigger_data" jsonb DEFAULT '{}'::jsonb,
	"result" jsonb DEFAULT '{}'::jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"trigger" jsonb NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb,
	"actions" jsonb DEFAULT '[]'::jsonb,
	"enabled" boolean DEFAULT true,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"run_count" integer DEFAULT 0,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "billing_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'USD',
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"stripe_invoice_id" varchar(255),
	"pdf_url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"provider" varchar(20) NOT NULL,
	"provider_payment_method_id" varchar(255) NOT NULL,
	"last4" varchar(4),
	"brand" varchar(50),
	"exp_month" integer,
	"exp_year" integer,
	"is_default" boolean DEFAULT false,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"price_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'USD',
	"interval" varchar(20) NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb,
	"limits" jsonb DEFAULT '{}'::jsonb,
	"stripe_price_id" varchar(255),
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'trial' NOT NULL,
	"current_period_start" timestamp with time zone DEFAULT now() NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"stripe_subscription_id" varchar(255),
	"stripe_customer_id" varchar(255),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"metric" varchar(50) NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cohort_retention" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"cohort_month" date NOT NULL,
	"period_number" integer NOT NULL,
	"customers_count" integer DEFAULT 0 NOT NULL,
	"retained_count" integer DEFAULT 0 NOT NULL,
	"revenue_retained" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(50) NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb,
	"config_schema" jsonb DEFAULT '{}'::jsonb,
	"pricing" varchar(20) DEFAULT 'free' NOT NULL,
	"price_cents" integer DEFAULT 0,
	"currency" varchar(3) DEFAULT 'USD',
	"publisher_id" uuid,
	"version" varchar(50) DEFAULT '1.0.0' NOT NULL,
	"status" varchar(20) DEFAULT 'published' NOT NULL,
	"icon_url" text,
	"readme_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"status" varchar(20) DEFAULT 'installed' NOT NULL,
	"installed_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revenue_forecast" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"forecast_date" date NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"predicted_mrr" integer NOT NULL,
	"predicted_arr" integer NOT NULL,
	"confidence_lower" integer,
	"confidence_upper" integer,
	"model_version" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revenue_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"date" date NOT NULL,
	"mrr" integer DEFAULT 0 NOT NULL,
	"arr" integer DEFAULT 0 NOT NULL,
	"new_mrr" integer DEFAULT 0 NOT NULL,
	"expansion_mrr" integer DEFAULT 0 NOT NULL,
	"contraction_mrr" integer DEFAULT 0 NOT NULL,
	"churned_mrr" integer DEFAULT 0 NOT NULL,
	"total_customers" integer DEFAULT 0 NOT NULL,
	"new_customers" integer DEFAULT 0 NOT NULL,
	"churned_customers" integer DEFAULT 0 NOT NULL,
	"arpu" integer DEFAULT 0 NOT NULL,
	"ltv" integer DEFAULT 0 NOT NULL,
	"cac" integer DEFAULT 0 NOT NULL,
	"payback_period" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "white_label_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"product_name" varchar(120),
	"tagline" varchar(200),
	"logo_key" text,
	"favicon_key" text,
	"login_background_key" text,
	"primary_color" varchar(9),
	"secondary_color" varchar(9),
	"font_family" varchar(100),
	"custom_domain" varchar(255),
	"email_from_name" varchar(120),
	"email_reply_to" varchar(255),
	"terms_url" varchar(500),
	"privacy_url" varchar(500),
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"edges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1,
	"is_active" boolean DEFAULT false,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"definition_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"input_data" jsonb DEFAULT '{}'::jsonb,
	"output_data" jsonb DEFAULT '{}'::jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_step_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"node_id" varchar(100) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"input_data" jsonb DEFAULT '{}'::jsonb,
	"output_data" jsonb DEFAULT '{}'::jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounting_accounts" ADD CONSTRAINT "accounting_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_invoices" ADD CONSTRAINT "accounting_invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_invoices" ADD CONSTRAINT "accounting_invoices_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_invoices" ADD CONSTRAINT "accounting_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_journal_entries" ADD CONSTRAINT "accounting_journal_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_journal_entries" ADD CONSTRAINT "accounting_journal_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_journal_entries" ADD CONSTRAINT "accounting_journal_entries_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_journal_lines" ADD CONSTRAINT "accounting_journal_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_journal_lines" ADD CONSTRAINT "accounting_journal_lines_entry_id_accounting_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."accounting_journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_journal_lines" ADD CONSTRAINT "accounting_journal_lines_account_id_accounting_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounting_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_payments" ADD CONSTRAINT "accounting_payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_payments" ADD CONSTRAINT "accounting_payments_invoice_id_accounting_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."accounting_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_payments" ADD CONSTRAINT "accounting_payments_journal_entry_id_accounting_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."accounting_journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_payments" ADD CONSTRAINT "accounting_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_tax_rates" ADD CONSTRAINT "accounting_tax_rates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_workflow_id_automation_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."automation_workflows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_workflows" ADD CONSTRAINT "automation_workflows_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_workflows" ADD CONSTRAINT "automation_workflows_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_workflows" ADD CONSTRAINT "automation_workflows_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_subscription_id_billing_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."billing_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_plan_id_billing_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."billing_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_payment_methods" ADD CONSTRAINT "billing_payment_methods_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_payment_methods" ADD CONSTRAINT "billing_payment_methods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_plans" ADD CONSTRAINT "billing_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_plan_id_billing_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."billing_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_usage_records" ADD CONSTRAINT "billing_usage_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_usage_records" ADD CONSTRAINT "billing_usage_records_subscription_id_billing_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."billing_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_retention" ADD CONSTRAINT "cohort_retention_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_agents" ADD CONSTRAINT "marketplace_agents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_agents" ADD CONSTRAINT "marketplace_agents_publisher_id_users_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_installations" ADD CONSTRAINT "marketplace_installations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_installations" ADD CONSTRAINT "marketplace_installations_agent_id_marketplace_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."marketplace_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_installations" ADD CONSTRAINT "marketplace_installations_installed_by_users_id_fk" FOREIGN KEY ("installed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_reviews" ADD CONSTRAINT "marketplace_reviews_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_reviews" ADD CONSTRAINT "marketplace_reviews_agent_id_marketplace_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."marketplace_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_reviews" ADD CONSTRAINT "marketplace_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_forecast" ADD CONSTRAINT "revenue_forecast_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_metrics" ADD CONSTRAINT "revenue_metrics_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "white_label_settings" ADD CONSTRAINT "white_label_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_definition_id_workflow_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_step_runs" ADD CONSTRAINT "workflow_step_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_step_runs" ADD CONSTRAINT "workflow_step_runs_execution_id_workflow_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounting_accounts_org_idx" ON "accounting_accounts" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_accounts_code_idx" ON "accounting_accounts" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "accounting_invoices_org_idx" ON "accounting_invoices" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_invoices_number_idx" ON "accounting_invoices" USING btree ("organization_id","invoice_number");--> statement-breakpoint
CREATE INDEX "accounting_invoices_status_idx" ON "accounting_invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "accounting_journal_entries_org_idx" ON "accounting_journal_entries" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_journal_entries_number_idx" ON "accounting_journal_entries" USING btree ("organization_id","entry_number");--> statement-breakpoint
CREATE INDEX "accounting_journal_entries_date_idx" ON "accounting_journal_entries" USING btree ("date");--> statement-breakpoint
CREATE INDEX "accounting_journal_entries_status_idx" ON "accounting_journal_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "accounting_journal_lines_entry_idx" ON "accounting_journal_lines" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "accounting_journal_lines_account_idx" ON "accounting_journal_lines" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "accounting_payments_org_idx" ON "accounting_payments" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_payments_number_idx" ON "accounting_payments" USING btree ("organization_id","payment_number");--> statement-breakpoint
CREATE INDEX "accounting_payments_status_idx" ON "accounting_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "accounting_tax_rates_org_idx" ON "accounting_tax_rates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "automation_runs_org_idx" ON "automation_runs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "automation_runs_workflow_idx" ON "automation_runs" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "automation_runs_status_idx" ON "automation_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "automation_workflows_org_idx" ON "automation_workflows" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "automation_workflows_enabled_idx" ON "automation_workflows" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "billing_invoices_org_idx" ON "billing_invoices" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "billing_invoices_subscription_idx" ON "billing_invoices" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "billing_invoices_status_idx" ON "billing_invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "billing_payment_methods_org_idx" ON "billing_payment_methods" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "billing_payment_methods_user_idx" ON "billing_payment_methods" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_payment_methods_provider_idx" ON "billing_payment_methods" USING btree ("provider","provider_payment_method_id");--> statement-breakpoint
CREATE INDEX "billing_plans_org_idx" ON "billing_plans" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "billing_plans_active_idx" ON "billing_plans" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "billing_subscriptions_org_idx" ON "billing_subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "billing_subscriptions_status_idx" ON "billing_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_subscriptions_stripe_idx" ON "billing_subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "billing_usage_org_idx" ON "billing_usage_records" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "billing_usage_subscription_idx" ON "billing_usage_records" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "billing_usage_metric_idx" ON "billing_usage_records" USING btree ("metric");--> statement-breakpoint
CREATE INDEX "cohort_retention_org_idx" ON "cohort_retention" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "cohort_retention_cohort_idx" ON "cohort_retention" USING btree ("cohort_month");--> statement-breakpoint
CREATE INDEX "marketplace_agents_org_idx" ON "marketplace_agents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "marketplace_agents_category_idx" ON "marketplace_agents" USING btree ("category");--> statement-breakpoint
CREATE INDEX "marketplace_agents_status_idx" ON "marketplace_agents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "marketplace_installations_org_idx" ON "marketplace_installations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "marketplace_installations_agent_idx" ON "marketplace_installations" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "marketplace_installations_status_idx" ON "marketplace_installations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_installations_org_agent_unique" ON "marketplace_installations" USING btree ("organization_id","agent_id");--> statement-breakpoint
CREATE INDEX "marketplace_reviews_org_idx" ON "marketplace_reviews" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "marketplace_reviews_agent_idx" ON "marketplace_reviews" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "marketplace_reviews_user_idx" ON "marketplace_reviews" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_reviews_org_agent_user_unique" ON "marketplace_reviews" USING btree ("organization_id","agent_id","user_id");--> statement-breakpoint
CREATE INDEX "revenue_forecast_org_idx" ON "revenue_forecast" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "revenue_forecast_date_idx" ON "revenue_forecast" USING btree ("forecast_date");--> statement-breakpoint
CREATE INDEX "revenue_metrics_org_idx" ON "revenue_metrics" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "revenue_metrics_date_idx" ON "revenue_metrics" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "revenue_metrics_org_date_unique" ON "revenue_metrics" USING btree ("organization_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "white_label_settings_org_uq" ON "white_label_settings" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "white_label_settings_domain_uq" ON "white_label_settings" USING btree ("custom_domain");--> statement-breakpoint
CREATE INDEX "workflow_definitions_org_idx" ON "workflow_definitions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "workflow_definitions_active_idx" ON "workflow_definitions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "workflow_executions_org_idx" ON "workflow_executions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "workflow_executions_definition_idx" ON "workflow_executions" USING btree ("definition_id");--> statement-breakpoint
CREATE INDEX "workflow_executions_status_idx" ON "workflow_executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workflow_step_runs_org_idx" ON "workflow_step_runs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "workflow_step_runs_execution_idx" ON "workflow_step_runs" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "workflow_step_runs_node_idx" ON "workflow_step_runs" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "workflow_step_runs_status_idx" ON "workflow_step_runs" USING btree ("status");