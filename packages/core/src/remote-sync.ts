import { z } from 'zod';
import { db, sql } from './drizzle.js';
import { syncActionToRemoteQueue } from './queues.ts';

export const syncActionsSchema = z.union([
	z.object({ id: z.literal('label:create'), labelId: z.string(), name: z.string() }),
	z.object({ id: z.literal('label:add'), labelId: z.string() }),
	z.object({ id: z.literal('label:remove'), labelId: z.string() }),
	z.object({ id: z.literal('trash:add') }),
	z.object({ id: z.literal('trash:remove') }),
	z.object({ id: z.literal('spam:add') }),
	z.object({ id: z.literal('spam:remove') }),
	z.object({ id: z.literal('unread:add') }),
	z.object({ id: z.literal('unread:remove') }),
	z.object({ id: z.literal('resolve:add') }),
	z.object({ id: z.literal('resolve:remove') }),
]);

export async function syncWithRemote({
	action,
	accountId,
	remoteThreadIds,
}: {
	action: z.infer<typeof syncActionsSchema>;
	accountId: string;
	remoteThreadIds: string[];
}) {
	// Gmail's API quotas are lower for modifying messages than threads when there's only one message in the thread, so we can optimize for that case, as it results in the same end state.
	const singleMessageThreads = await db.execute(sql`
    SELECT t."remoteId", m."remoteId" as message_id
    FROM "Thread" t
    JOIN "Message" m ON t.id = m."threadId"
    WHERE t."remoteId" IN (${sql.join(
			remoteThreadIds.map((id) => sql`${id}`),
			sql`, `,
		)})
    AND NOT EXISTS (
        SELECT 1 FROM "Message" m2
        WHERE m2."threadId" = t.id AND m2.id != m.id
    )
	`);

	const threadMessageMap = Object.fromEntries(
		singleMessageThreads.rows.map((row) => [row.remoteId as string, row.message_id as string]),
	);

	await syncActionToRemoteQueue.addBulk(
		remoteThreadIds.map((remoteThreadId) => ({
			name: 'sync-action-to-remote',
			data: {
				action,
				remoteThreadId,
				remoteMessageId: threadMessageMap[remoteThreadId],
				accountId,
			},
		})),
	);
}
