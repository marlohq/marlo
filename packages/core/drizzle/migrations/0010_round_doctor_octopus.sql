INSERT INTO "Space" ("id", "accountId", "name", "filters", "properties", "sortBy", "groupBy", "createdAt", "updatedAt")
SELECT
    'inbox_' || "id" as "id",
    "id" as "accountId",
    'Inbox' as "name",
    '[]'::jsonb as "filters",
    '[]'::jsonb as "properties",
	'' as "sortBy",
	'' as "groupBy",
    NOW() as "createdAt",
    NOW() as "updatedAt"
FROM "Account"
WHERE NOT EXISTS (
    SELECT 1 FROM "Space" WHERE "id" = 'inbox_' || "Account"."id"
);

INSERT INTO "Space" ("id", "accountId", "name", "filters", "properties", "sortBy", "groupBy", "createdAt", "updatedAt")
SELECT
    'reminders_' || "id" as "id",
    "id" as "accountId",
    'Reminders' as "name",
    '[]'::jsonb as "filters",
    '[]'::jsonb as "properties",
		'' as "sortBy",
		'' as "groupBy",
    NOW() as "createdAt",
    NOW() as "updatedAt"
FROM "Account"
WHERE NOT EXISTS (
    SELECT 1 FROM "Space" WHERE "id" = 'reminders_' || "Account"."id"
);

UPDATE "SpaceThreadTag"
SET
    "spaceId" = CASE
        WHEN "spaceId" = 'inbox' THEN 'inbox_' || "accountId"
        WHEN "spaceId" = 'reminders' THEN 'reminders_' || "accountId"
        ELSE "spaceId"
    END,
    "updatedAt" = NOW()
WHERE "spaceId" IN ('inbox', 'reminders');

UPDATE "SpaceItem"
SET
    "spaceId" = CASE
        WHEN "spaceId" = 'inbox' THEN 'inbox_' || "accountId"
        WHEN "spaceId" = 'reminders' THEN 'reminders_' || "accountId"
        ELSE "spaceId"
    END,
    "updatedAt" = NOW()
WHERE "spaceId" IN ('inbox', 'reminders');

ALTER TABLE "SpaceThreadTag" ADD CONSTRAINT "SpaceThreadTag_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "public"."Space"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
