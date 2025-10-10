CREATE TYPE "public"."MCPServerStatus" AS ENUM('INACTIVE', 'ACTIVE', 'ERROR', 'CONNECTING');--> statement-breakpoint
CREATE TABLE "MCPServer" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"serverUrlEnc" text,
	"serverUrlIv" "bytea",
	"serverUrlAuthTag" "bytea",
	"status" "MCPServerStatus" DEFAULT 'INACTIVE' NOT NULL,
	"lastError" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Space" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"properties" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"groupBy" text,
	"sortBy" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ViewItem" RENAME TO "SpaceItem";--> statement-breakpoint
ALTER TABLE "ViewThreadTag" RENAME TO "SpaceThreadTag";--> statement-breakpoint
ALTER TABLE "SpaceItem" DROP CONSTRAINT "ViewItem_accountId_fkey";
--> statement-breakpoint
ALTER TABLE "SpaceThreadTag" DROP CONSTRAINT "ViewThreadTag_accountId_fkey";
--> statement-breakpoint
ALTER TABLE "SpaceThreadTag" DROP CONSTRAINT "ViewThreadTag_threadId_fkey";
--> statement-breakpoint
DROP INDEX "ViewThreadTag_accountId_viewId_threadId_key";--> statement-breakpoint
ALTER TABLE "MCPServer" ADD CONSTRAINT "MCPServer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Space" ADD CONSTRAINT "Space_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "MCPServer_userId_status_idx" ON "MCPServer" USING btree ("userId" text_ops,"status" enum_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Space_accountId_name_key" ON "Space" USING btree ("accountId" text_ops,"name" text_ops);--> statement-breakpoint
ALTER TABLE "SpaceItem" ADD CONSTRAINT "SpaceItem_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "SpaceThreadTag" ADD CONSTRAINT "SpaceThreadTag_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "SpaceThreadTag" ADD CONSTRAINT "SpaceThreadTag_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "public"."Thread"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "SpaceThreadTag_accountId_viewId_threadId_key" ON "SpaceThreadTag" USING btree ("accountId" text_ops,"viewId" text_ops,"threadId" text_ops);