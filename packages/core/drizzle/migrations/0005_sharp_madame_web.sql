CREATE TYPE "public"."SpaceActionRunStatus" AS ENUM('pending', 'running', 'success', 'error');--> statement-breakpoint
CREATE TYPE "public"."SpaceActionTriggerType" AS ENUM('new_message', 'manual', 'cron');--> statement-breakpoint
CREATE TABLE "SpaceAction" (
	"id" text PRIMARY KEY NOT NULL,
	"spaceId" text NOT NULL,
	"accountId" text NOT NULL,
	"triggerType" "SpaceActionTriggerType" NOT NULL,
	"prompt" text NOT NULL,
	"cronSchedule" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "SpaceActionRun" (
	"id" text PRIMARY KEY NOT NULL,
	"actionId" text NOT NULL,
	"threadId" text,
	"status" "SpaceActionRunStatus" NOT NULL,
	"result" jsonb,
	"error" text,
	"startedAt" timestamp (3) NOT NULL,
	"completedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "SpaceAction" ADD CONSTRAINT "SpaceAction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "SpaceAction" ADD CONSTRAINT "SpaceAction_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "public"."Space"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "SpaceActionRun" ADD CONSTRAINT "SpaceActionRun_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "public"."SpaceAction"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "SpaceActionRun" ADD CONSTRAINT "SpaceActionRun_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "public"."Thread"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "SpaceAction_accountId_idx" ON "SpaceAction" USING btree ("accountId" text_ops);--> statement-breakpoint
CREATE INDEX "SpaceAction_spaceId_idx" ON "SpaceAction" USING btree ("spaceId" text_ops);--> statement-breakpoint
CREATE INDEX "SpaceActionRun_actionId_idx" ON "SpaceActionRun" USING btree ("actionId" text_ops);--> statement-breakpoint
CREATE INDEX "SpaceActionRun_threadId_idx" ON "SpaceActionRun" USING btree ("threadId" text_ops);--> statement-breakpoint
CREATE INDEX "SpaceActionRun_status_idx" ON "SpaceActionRun" USING btree ("status" enum_ops);