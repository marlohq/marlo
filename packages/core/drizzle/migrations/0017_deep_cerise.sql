CREATE TYPE "public"."ContactSavedStatus" AS ENUM('contact', 'otherContact', 'acquaintance');--> statement-breakpoint
ALTER TABLE "Contact" ADD COLUMN "type" "ContactSavedStatus";--> statement-breakpoint
UPDATE "Contact" SET "type" = CASE
    WHEN "saved" = true THEN 'contact'::"ContactSavedStatus"
    ELSE 'otherContact'::"ContactSavedStatus"
END;--> statement-breakpoint
ALTER TABLE "Contact" ALTER COLUMN "type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Contact" DROP COLUMN "saved";--> statement-breakpoint
ALTER TABLE "Contact" ALTER COLUMN "remoteId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "Contact" ALTER COLUMN "hash" DROP NOT NULL;--> statement-breakpoint
