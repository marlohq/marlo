ALTER TABLE "AppThreadTag" RENAME TO "ThreadCategory";--> statement-breakpoint
ALTER TABLE "ThreadCategory" RENAME COLUMN "appId" TO "categoryId";--> statement-breakpoint
ALTER TABLE "ThreadCategory" DROP CONSTRAINT "AppThreadTag_threadId_fkey";
--> statement-breakpoint
DROP INDEX "AppThreadTag_appId_threadId_key";--> statement-breakpoint
ALTER TABLE "ThreadCategory" ADD CONSTRAINT "ThreadCategory_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "public"."Thread"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "ThreadCategory_categoryId_threadId_key" ON "ThreadCategory" USING btree ("categoryId" text_ops,"threadId" text_ops);