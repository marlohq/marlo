DROP INDEX "Invite_email_key";--> statement-breakpoint
ALTER TABLE "Invite" ADD COLUMN "invitedBy" text;--> statement-breakpoint
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "public"."User"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "Invite_invitedBy_email_key" ON "Invite" USING btree ("invitedBy" text_ops,"email" text_ops);