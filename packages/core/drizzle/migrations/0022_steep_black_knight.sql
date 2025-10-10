ALTER TABLE "Contact" ADD COLUMN "profile" jsonb;--> statement-breakpoint
ALTER TABLE "Contact" ADD COLUMN "profileUpdatedAt" timestamp (3) with time zone;