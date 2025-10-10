ALTER TABLE "Invite" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "Invite" CASCADE;--> statement-breakpoint
ALTER TABLE "User" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "User" ALTER COLUMN "status" SET DEFAULT 'INACTIVE'::text;--> statement-breakpoint
DROP TYPE "public"."UserStatus";--> statement-breakpoint
CREATE TYPE "public"."UserStatus" AS ENUM('INACTIVE', 'ACTIVE');--> statement-breakpoint
ALTER TABLE "User" ALTER COLUMN "status" SET DEFAULT 'INACTIVE'::"public"."UserStatus";--> statement-breakpoint
ALTER TABLE "User" ALTER COLUMN "status" SET DATA TYPE "public"."UserStatus" USING "status"::"public"."UserStatus";