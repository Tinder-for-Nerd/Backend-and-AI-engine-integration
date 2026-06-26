CREATE TABLE "ai_embedding_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"vector_id" text NOT NULL,
	"collection" text NOT NULL,
	"model" text NOT NULL,
	"source_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"dimensions" integer,
	"error" text,
	"embedded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_explanations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"freelancer_id" uuid NOT NULL,
	"source_hash" text NOT NULL,
	"explanation" text NOT NULL,
	"model" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_quality_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"freelancer_id" uuid NOT NULL,
	"source_hash" text NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"summary" text,
	"strengths" text[] DEFAULT '{}' NOT NULL,
	"risks" text[] DEFAULT '{}' NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evaluated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_requirement_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"source_hash" text NOT NULL,
	"extracted_skills" text[] DEFAULT '{}' NOT NULL,
	"budget_min_cents" integer,
	"budget_max_cents" integer,
	"duration_weeks" integer,
	"seniority" text,
	"domain" text,
	"summary" text,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"analyzed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_explanations" ADD CONSTRAINT "match_explanations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_explanations" ADD CONSTRAINT "match_explanations_freelancer_id_freelancers_id_fk" FOREIGN KEY ("freelancer_id") REFERENCES "public"."freelancers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_quality_scores" ADD CONSTRAINT "portfolio_quality_scores_freelancer_id_freelancers_id_fk" FOREIGN KEY ("freelancer_id") REFERENCES "public"."freelancers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_requirement_analyses" ADD CONSTRAINT "project_requirement_analyses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_embedding_records_owner_unique" ON "ai_embedding_records" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_embedding_records_vector_unique" ON "ai_embedding_records" USING btree ("collection","vector_id");--> statement-breakpoint
CREATE INDEX "ai_embedding_records_status_idx" ON "ai_embedding_records" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "match_explanations_match_unique" ON "match_explanations" USING btree ("project_id","freelancer_id","source_hash");--> statement-breakpoint
CREATE INDEX "match_explanations_expires_idx" ON "match_explanations" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_quality_scores_freelancer_unique" ON "portfolio_quality_scores" USING btree ("freelancer_id");--> statement-breakpoint
CREATE INDEX "portfolio_quality_scores_source_hash_idx" ON "portfolio_quality_scores" USING btree ("source_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "project_requirement_analyses_project_unique" ON "project_requirement_analyses" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_requirement_analyses_source_hash_idx" ON "project_requirement_analyses" USING btree ("source_hash");