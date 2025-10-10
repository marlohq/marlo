import { and, db, eq, space } from '@workspace/core/drizzle.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import { actionQueue } from '@workspace/core/queues.js';

const logger = baseLogger.child({ namespace: 'action:trigger-detection' });

/** Checks if a new message should trigger any space actions and queues them for execution */
export async function checkAndQueueSpaceActions(
	accountId: string,
	threadIdAndMessageId: { threadId: string; messageId: string },
) {
	const { threadId, messageId } = threadIdAndMessageId;

	logger.info({ accountId, threadId, messageId }, 'Checking for space action triggers');

	try {
		const thr = await db.query.thread.findFirst({
			where: (t, { eq, and }) => and(eq(t.id, threadId), eq(t.accountId, accountId)),
			columns: { spaceId: true },
		});

		if (!thr) {
			logger.info({ threadId }, 'Thread not found, skipping action detection');
			return;
		}
		if (!thr.spaceId) {
			logger.info({ threadId }, 'Thread not in any space, skipping action detection');
			return;
		}

		logger.info({ threadId, spaceId: thr.spaceId }, 'Found thread space, checking for actions');

		const spacesWithAction = await db.query.space.findMany({
			where: and(eq(space.accountId, accountId), eq(space.id, thr.spaceId)),
			with: {
				actions: {
					where: (spaceAction, { eq }) => eq(spaceAction.triggerType, 'new_message'),
				},
			},
		});

		const actionsToQueue: Parameters<typeof actionQueue.addBulk>[0] = [];

		logger.info(
			{
				spacesWithActionCount: spacesWithAction.length,
				spacesWithActionDetails: spacesWithAction.map((v) => ({
					id: v.id,
					name: v.name,
					actionCount: v.actions.length,
				})),
			},
			'Fetched views with their actions',
		);

		for (const viewData of spacesWithAction) {
			for (const action of viewData.actions) {
				logger.info(
					{
						actionId: action.id,
						threadId,
						spaceId: viewData.id,
						spaceName: viewData.name,
					},
					'Queueing space action for new message trigger',
				);

				actionsToQueue.push({
					name: 'execute-action' as const,
					data: {
						actionId: action.id,
						threadId,
						triggerType: 'new_message' as const,
					},
				});
			}
		}

		if (actionsToQueue.length > 0) {
			await actionQueue.addBulk(actionsToQueue);
			logger.info(
				{
					count: actionsToQueue.length,
					threadId,
					accountId,
				},
				'Sent messages to action queue for execution',
			);
		}
	} catch (error) {
		logger.error({ error, accountId, threadId }, 'Failed to check/queue space actions');
		// Don't throw - we don't want to fail message processing if action detection fails
	}
}
