import { type ActionContext, executeAction } from '@workspace/backend/actions/executeAction.ts';
import { loadTools } from '@workspace/backend/tools/registry.ts';
import {
	account as accountTable,
	db,
	eq,
	spaceAction,
	spaceActionRun,
} from '@workspace/core/drizzle.ts';
import { logger as baseLogger } from '@workspace/core/logger.js';
import { type Job, UnrecoverableError, Worker } from '@workspace/core/queue-exports.js';
import type { SpaceActionJobData } from '@workspace/core/queues.js';
import { connection } from '@workspace/core/redis-connection.js';
import { getGmailClientForAccount } from '@workspace/google/request-client.js';
import { invariant } from 'es-toolkit';
import { setupWorkerErrorHandlers } from '../error.ts';

const logger = baseLogger.child({ namespace: 'mail-ingester:queues:actions' });

const ACTION_PROCESSING_CONCURRENCY = 10; // Lower concurrency for action processing

export const actionWorker = new Worker(
	'actionQueue',
	async (job: Job<SpaceActionJobData>) => {
		const { actionId, threadId, triggerType } = job.data;

		logger.info({ actionId, threadId, triggerType }, 'Processing space action execution');

		try {
			// Create a run record to track execution
			const [runRecord] = await db
				.insert(spaceActionRun)
				.values({
					actionId,
					threadId,
					status: 'running',
					startedAt: new Date(),
				})
				.returning();
			invariant(runRecord, 'Run record not found');

			try {
				// Fetch the action configuration
				const action = await db.query.spaceAction.findFirst({
					where: eq(spaceAction.id, actionId),
					with: {
						space: true,
					},
				});

				if (!action) {
					throw new UnrecoverableError(`Action ${actionId} not found`);
				}

				// Fetch the account separately to avoid bytea serialization issues
				const account = await db.query.account.findFirst({
					where: eq(accountTable.id, action.accountId),
				});

				if (!account) {
					throw new UnrecoverableError(`Account ${action.accountId} not found`);
				}

				// Get Gmail client for tool access
				const gmailResponse = await getGmailClientForAccount(account);
				if (gmailResponse.error) {
					throw new Error(`Gmail client error: ${gmailResponse.error}`);
				}

				// Load tools including MCP tools
				const tools = await loadTools(
					['email', 'drafts', 'thread_management', 'notifications', 'mcp'],
					gmailResponse.client,
					account,
				);

				// Get thread details if threadId is provided
				let threadData = null;
				if (threadId) {
					const threadResult = await db.query.thread.findFirst({
						where: (thread, { eq, and }) =>
							and(eq(thread.id, threadId), eq(thread.accountId, account.id)),
						columns: {
							id: true,
							lastSentAt: true,
							resolvedAt: true,
						},
						with: {
							messages: {
								columns: {
									senderEmail: true,
									senderName: true,
									subject: true,
									extractedContent: true,
									contentText: true,
									contentHtml: true,
									sentAt: true,
									deletedAt: true,
									draftId: true,
								},
								with: {
									messageRecipients: true,
								},
								orderBy: (message, { desc }) => [desc(message.sentAt)],
							},
						},
					});

					if (threadResult) {
						threadData = {
							...threadResult,
							messages: threadResult.messages
								.filter((msg) => !msg.deletedAt)
								.map((msg) => ({
									...msg,
									messageRecipients: msg.messageRecipients,
								})),
						};
					}
				}
				invariant(threadData, 'Thread data not found');

				// Build action context
				const actionContext: ActionContext = {
					action: action,
					space: action.space,
					account: account,
					thread: threadData,
				};

				// Execute the action with AI and tools
				const result = await executeAction(actionContext, tools);

				// Record success
				await db
					.update(spaceActionRun)
					.set({
						status: 'success',
						completedAt: new Date(),
						result: {
							success: result.success,
							reasoningText: result.reasoningText,
							toolCalls: result.toolCalls,
						},
					})
					.where(eq(spaceActionRun.id, runRecord.id));

				logger.info(
					{ actionId, threadId, runId: runRecord.id },
					'Space action executed successfully',
				);
			} catch (actionError) {
				// Update run record with error
				await db
					.update(spaceActionRun)
					.set({
						status: 'error',
						completedAt: new Date(),
						error: actionError instanceof Error ? actionError.message : String(actionError),
					})
					.where(eq(spaceActionRun.id, runRecord.id));

				throw actionError;
			}
		} catch (error) {
			logger.error({ actionId, threadId, error }, 'Failed to execute space action');

			throw error;
		}
	},
	{
		connection,
		concurrency: ACTION_PROCESSING_CONCURRENCY,
		removeOnComplete: {
			count: 1000,
		},
		removeOnFail: {
			count: 1500,
		},
	},
);

setupWorkerErrorHandlers(actionWorker, {});
