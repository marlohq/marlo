CREATE TYPE "public"."MCPServerTransport" AS ENUM('sse', 'http');--> statement-breakpoint
CREATE TABLE "Skill" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"prompt" text NOT NULL,
	"builtins" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deletedAt" timestamp (3) with time zone,
	"createdAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "SkillInstallation" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"skillId" text NOT NULL,
	"appInstallationId" text,
	"deletedAt" timestamp (3) with time zone,
	"createdAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "MCPServer" ADD COLUMN "transport" "MCPServerTransport" DEFAULT 'sse' NOT NULL;--> statement-breakpoint
ALTER TABLE "MCPServer" ADD COLUMN "appInstallationId" text NOT NULL;--> statement-breakpoint
ALTER TABLE "SkillInstallation" ADD CONSTRAINT "SkillInstallation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "SkillInstallation" ADD CONSTRAINT "SkillInstallation_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "public"."Skill"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "SkillInstallation_accountId_idx" ON "SkillInstallation" USING btree ("accountId" text_ops);--> statement-breakpoint
ALTER TABLE "MCPServer" ADD CONSTRAINT "MCPServer_appInstallationId_fkey" FOREIGN KEY ("appInstallationId") REFERENCES "public"."AppInstallation"("id") ON DELETE cascade ON UPDATE cascade;

ALTER TABLE "SkillInstallation" ALTER COLUMN "appInstallationId" DROP NOT NULL;

-- Seed initial skills
INSERT INTO "Skill" ("id", "name", "description", "prompt", "builtins")
VALUES (
  'related-threads',
  'Related Threads',
  'Finds the most relevant related threads for the current thread using mailbox tools.',
  '',
  '["search"]'::jsonb
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Skill" ("id", "name", "description", "prompt", "builtins")
VALUES (
  'github',
  'GitHub',
  'Generates essential GitHub context relevant to the thread.',
  '',
  '[]'::jsonb
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Skill" ("id", "name", "description", "prompt", "builtins")
VALUES (
  'stripe',
  'Stripe',
  'Generates essential Stripe context relevant to the thread using any attached Stripe app installations.',
  '',
  '[]'::jsonb
)
ON CONFLICT ("id") DO NOTHING;