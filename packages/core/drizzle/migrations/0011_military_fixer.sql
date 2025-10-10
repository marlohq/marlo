DROP INDEX "Message_threadId_idx";--> statement-breakpoint
DROP INDEX "Message_threadId_senderEmail_idx";--> statement-breakpoint
CREATE INDEX "Message_threadId_sentAt_idx" ON "Message" USING btree ("threadId" text_ops,"sentAt" timestamptz_ops);--> statement-breakpoint