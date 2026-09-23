CREATE TABLE "ai_model_defaults" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"capability" varchar(50) NOT NULL,
	"provider" varchar(50) NOT NULL,
	"model_id" varchar(255) NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" varchar(50) NOT NULL,
	"label" varchar(255),
	"base_url" text,
	"encrypted_key" text NOT NULL,
	"key_suffix" varchar(16) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"last_tested_at" timestamp with time zone,
	"last_test_result" varchar(20),
	"last_test_error" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_model_defaults" ADD CONSTRAINT "ai_model_defaults_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_defaults" ADD CONSTRAINT "ai_model_defaults_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_providers" ADD CONSTRAINT "ai_providers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_providers" ADD CONSTRAINT "ai_providers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_providers" ADD CONSTRAINT "ai_providers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_model_defaults_org_idx" ON "ai_model_defaults" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_model_defaults_org_cap_idx" ON "ai_model_defaults" USING btree ("organization_id","capability");--> statement-breakpoint
CREATE INDEX "ai_providers_org_idx" ON "ai_providers" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_providers_org_provider_idx" ON "ai_providers" USING btree ("organization_id","provider");