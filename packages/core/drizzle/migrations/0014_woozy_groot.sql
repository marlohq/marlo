CREATE TABLE "CategoryProperty" (
	"id" text PRIMARY KEY NOT NULL,
	"threadId" text NOT NULL,
	"accountId" text NOT NULL,
	"category" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"createdAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "SpaceProperty" (
	"id" text PRIMARY KEY NOT NULL,
	"threadId" text NOT NULL,
	"accountId" text NOT NULL,
	"spaceId" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"createdAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Thread" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "Thread" ADD COLUMN "spaceId" text;--> statement-breakpoint
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "public"."Space"("id") ON DELETE set null ON UPDATE cascade;
ALTER TABLE "CategoryProperty" ADD CONSTRAINT "CategoryProperty_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "public"."Thread"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "CategoryProperty" ADD CONSTRAINT "CategoryProperty_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "SpaceProperty" ADD CONSTRAINT "SpaceProperty_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "public"."Thread"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "SpaceProperty" ADD CONSTRAINT "SpaceProperty_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "CategoryProperty_accountId_idx" ON "CategoryProperty" USING btree ("accountId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "CategoryProperty_threadId_category_key_key" ON "CategoryProperty" USING btree ("threadId" text_ops,"category" text_ops,"key" text_ops);--> statement-breakpoint
CREATE INDEX "CategoryProperty_threadId_category_idx" ON "CategoryProperty" USING btree ("threadId" text_ops,"category" text_ops);--> statement-breakpoint
CREATE INDEX "SpaceProperty_accountId_idx" ON "SpaceProperty" USING btree ("accountId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "SpaceProperty_threadId_spaceId_key_key" ON "SpaceProperty" USING btree ("threadId" text_ops,"spaceId" text_ops,"key" text_ops);--> statement-breakpoint
CREATE INDEX "SpaceProperty_threadId_spaceId_idx" ON "SpaceProperty" USING btree ("threadId" text_ops,"spaceId" text_ops);--> statement-breakpoint
CREATE INDEX "Thread_category_idx" ON "Thread" USING btree ("category" text_ops);--> statement-breakpoint
CREATE INDEX "Thread_spaceId_idx" ON "Thread" USING btree ("spaceId" text_ops);
