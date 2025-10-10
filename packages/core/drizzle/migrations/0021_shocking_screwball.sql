DROP INDEX "Contact_accountId_email_acquaintance_key";--> statement-breakpoint
DROP INDEX "Contact_accountId_remoteId_key";--> statement-breakpoint
DROP INDEX "Contact_hash_key";--> statement-breakpoint
CREATE UNIQUE INDEX "Contact_accountId_email_key" ON "Contact" USING btree ("accountId" text_ops,"email" text_ops);--> statement-breakpoint
ALTER TABLE "Contact" DROP COLUMN "remoteId";--> statement-breakpoint
ALTER TABLE "Contact" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "Contact" DROP COLUMN "hash";--> statement-breakpoint
ALTER TABLE "Contact" DROP COLUMN "deletedAt";--> statement-breakpoint
DROP TYPE "public"."ContactSavedStatus";
