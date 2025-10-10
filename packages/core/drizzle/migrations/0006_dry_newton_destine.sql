DROP INDEX "Thread_accountId_updatedAt_idx";--> statement-breakpoint
CREATE INDEX "Thread_accountId_updatedAt_idx" ON "Thread" USING btree ("accountId" text_ops,"updatedAt" timestamp_ops);