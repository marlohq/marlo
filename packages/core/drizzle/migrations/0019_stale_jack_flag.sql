ALTER TABLE "Contact" ADD COLUMN "score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "Contact" ADD COLUMN "scoreUpdatedAt" timestamp (3) with time zone DEFAULT now();
