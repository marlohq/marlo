ALTER TABLE "SpaceItem" RENAME COLUMN "viewId" TO "spaceId";--> statement-breakpoint
ALTER TABLE "SpaceThreadTag" RENAME COLUMN "viewId" TO "spaceId";--> statement-breakpoint
DROP INDEX "SpaceThreadTag_accountId_viewId_threadId_key";--> statement-breakpoint
CREATE UNIQUE INDEX "SpaceThreadTag_accountId_spaceId_threadId_key" ON "SpaceThreadTag" USING btree ("accountId" text_ops,"spaceId" text_ops,"threadId" text_ops);