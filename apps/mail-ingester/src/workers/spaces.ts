import { checkAndQueueSpaceActions } from '@workspace/backend/actions/triggerDetection.js';
import {
	db,
	eq,
	type MessageWithRelations,
	spaceProperty,
	thread,
} from '@workspace/core/drizzle.ts';
import { env } from '@workspace/core/env.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import { type Job, WaitingChildrenError } from '@workspace/core/queue-exports.js';
import { Worker } from '@workspace/core/queue-exports.ts';
import type { FilterForSpaceJobData, PropertyEvaluationJobData } from '@workspace/core/queues.js';
import {
	aiQueue,
	enqueuePropertyEvaluation,
	FilterForSpaceStep,
	PropertyEvaluationStep,
} from '@workspace/core/queues.js';
import { connection } from '@workspace/core/redis-connection.js';
import type { SpaceFilter } from '@workspace/core/space.js';
import { createId } from '@workspace/core/util.ts';
import { filterForSpace } from '@workspace/google/mail-ingestion/space-filter.js';
import { invariant } from 'es-toolkit';
import { setupWorkerErrorHandlers } from '../error.js';

const logger = baseLogger.child({ namespace: 'mail-ingester:queues:spaces' });

// Helper functions for category filtering
function spaceUsesCategoryFilters(filters: SpaceFilter): boolean {
	return filters.some((filterGroup) =>
		filterGroup.some((filter) => 'field' in filter && filter.field === 'categories'),
	);
}

async function getCategoryForThread(threadId: string): Promise<string | null> {
	const t = await db.query.thread.findFirst({
		where: (thr, { eq }) => eq(thr.id, threadId),
		columns: { category: true },
	});
	return t?.category ?? null;
}

export const filterForSpaceWorker = new Worker(
	'filterForSpaceQueue',
	async (job: Job<FilterForSpaceJobData>, token?: string) => {
		let step = job.data.step;
		const { messageData, spaceId } = job.data;

		const { accountId, userId } = messageData;

		// Since extractedContent was removed from messageData, we'll need to get it from contentText or contentHtml
		const extractedContent = messageData.contentText || messageData.contentHtml;

		// If something weird came in, just ignore it.
		if (!job.id || !token) return;

		if (!extractedContent) {
			throw new Error('Extracted content is required for filter-for-space job');
		}

		while (step !== FilterForSpaceStep.Finished) {
			switch (step) {
				case FilterForSpaceStep.GetSpace: {
					const account = await db.query.account.findFirst({
						where: (account, { eq }) => eq(account.id, accountId),
					});

					invariant(account, 'Account is required for filtering for space');

					if (account.status !== 'ACTIVE') {
						logger.warn(
							{
								accountId: account.id,
								email: account.email,
								errorCode: account.errorCode,
							},
							'Account is not active, skipping filter for space',
						);
						await job.updateData({
							...job.data,
							step: FilterForSpaceStep.Finished,
						});
						step = FilterForSpaceStep.Finished;
						break;
					}

					const space = await db.query.space.findFirst({
						where: (space, { eq }) => eq(space.id, spaceId),
						columns: {
							id: true,
							filters: true,
							properties: true,
						},
					});

					invariant(space, 'Space is required for filtering for space');

					// Extract all natural language queries from the space filters
					const naturalQueries: string[] = [];
					for (const filterGroup of space.filters) {
						for (const filter of filterGroup) {
							if ('query' in filter) {
								naturalQueries.push(filter.query);
							}
						}
					}

					if (naturalQueries.length > 0) {
						// Schedule natural language query evaluation in AI queue
						await aiQueue.add(
							'evaluate-natural-queries',
							{
								messageId: messageData.id,
								userId,
								accountId,
								mailReport: extractedContent,
								queries: naturalQueries,
							},
							{
								parent: {
									id: job.id,
									queue: job.queueQualifiedName,
								},
							},
						);

						await job.updateData({
							...job.data,
							step: FilterForSpaceStep.WaitingForNaturalQueries,
							space,
						});
						step = FilterForSpaceStep.WaitingForNaturalQueries;
					} else {
						// No natural queries, proceed directly to evaluation
						await job.updateData({
							...job.data,
							step: FilterForSpaceStep.EvaluateFilters,
							space,
						});
						step = FilterForSpaceStep.EvaluateFilters;
					}
					break;
				}
				case FilterForSpaceStep.WaitingForNaturalQueries: {
					const shouldWait = await job.moveToWaitingChildren(token);
					if (!shouldWait) {
						// Children completed, extract natural query results
						const children = await job.getChildrenValues();
						const naturalQueryResults: { [query: string]: boolean } = {};

						// Process the results from natural language evaluation
						if (children && Object.keys(children).length > 0) {
							const evaluationResult = Object.values(children)[0] as {
								results: Array<{ query: string; matches: boolean }>;
							};
							if (evaluationResult?.results) {
								for (const result of evaluationResult.results) {
									naturalQueryResults[result.query] = result.matches;
								}
							}
						}

						await job.updateData({
							...job.data,
							step: FilterForSpaceStep.EvaluateFilters,
							naturalQueryResults,
						});
						step = FilterForSpaceStep.EvaluateFilters;
					} else {
						throw new WaitingChildrenError();
					}
					break;
				}
				case FilterForSpaceStep.EvaluateFilters: {
					const { space } = job.data;
					invariant(space, 'Space data must be available by EvaluateFilters step');

					// Check if space uses category filters and fetch single category if needed
					let category: string | null = null;
					if (spaceUsesCategoryFilters(space.filters)) {
						category = await getCategoryForThread(messageData.threadId);
					}

					// Evaluate filters with precalculated natural query results
					// Convert messageData to MessageWithRelations format for compatibility
					const messageForFiltering = {
						id: messageData.id,
						createdAt: new Date(), // These timestamps aren't used for filtering
						updatedAt: new Date(),
						remoteId: messageData.thread.remoteId,
						userId: messageData.userId,
						threadId: messageData.threadId,
						subject: messageData.subject,
						contentText: messageData.contentText,
						contentHtml: messageData.contentHtml,
						extractedContent: extractedContent,
						senderEmail: messageData.senderEmail,
						senderName: null, // Not used for filtering
						sentAt: messageData.sentAt,
						readAt: null,
						accountId: messageData.accountId,
						isSent: false, // This isn't used for filtering
						processed: true,
						inReplyTo: null,
						references: null,
						draftId: null,
						snippet: null,
						globalId: null,
						deletedAt: null,
						messageRecipients: messageData.messageRecipients,
						messageAttachments: messageData.messageAttachments,
						messageLabels: messageData.messageLabels,
					};

					const isPartOfSpace = filterForSpace(
						space.filters,
						messageForFiltering as unknown as MessageWithRelations, // Type casting for compatibility
						job.data.naturalQueryResults,
						category ?? undefined,
					);

					if (isPartOfSpace) {
						await db
							.update(thread)
							.set({ spaceId: space.id, updatedAt: new Date() })
							.where(eq(thread.id, messageData.threadId));

						// Check if this space has properties to evaluate
						if (space.properties && space.properties.length > 0) {
							// Schedule property evaluation in separate queue
							await enqueuePropertyEvaluation({
								userId,
								accountId,
								messageId: messageData.id,
								threadId: messageData.threadId,
								properties: space.properties,
								spaceId: space.id,
							});
						} else {
							// For spaces without properties, still check for action triggers
							logger.info(
								{
									spaceId: space.id,
									threadId: messageData.threadId,
									messageId: messageData.id,
								},
								'Space has no properties, checking for action triggers directly',
							);
							await checkAndQueueSpaceActions(accountId, {
								threadId: messageData.threadId,
								messageId: messageData.id,
							});
						}
					}

					await job.updateData({
						...job.data,
						step: FilterForSpaceStep.Finished,
					});
					step = FilterForSpaceStep.Finished;
					break;
				}
				default:
					throw new Error('Invalid filter step');
			}
		}
		return FilterForSpaceStep.Finished;
	},
	{
		connection,
		prefix: env.get('BULLMQ_QUEUE_PREFIX'),
	},
);

setupWorkerErrorHandlers(filterForSpaceWorker, {
	getJobContext: (job) => {
		const { messageData, spaceId } = job.data;
		return {
			accountId: messageData.accountId,
			spaceId,
			messageId: messageData.id,
			hasMailReport: !!(messageData.contentText || messageData.contentHtml),
		};
	},
	getErrorMessage: () => 'Failed to filter for space',
});

export const propertyEvaluationWorker = new Worker(
	'propertyEvaluationQueue',
	async (job: Job<PropertyEvaluationJobData>, token?: string) => {
		let step = job.data.step;
		const { accountId, userId } = job.data;

		// If something weird came in, just ignore it.
		if (!job.id || !token) return;

		while (step !== PropertyEvaluationStep.Finished) {
			switch (step) {
				case PropertyEvaluationStep.PrepareData: {
					const { spaceId, messageId, threadId } = job.data;

					// Fetch space properties if not provided
					let spaceProperties = job.data.properties;
					if (!spaceProperties) {
						const space = await db.query.space.findFirst({
							where: (space, { eq }) => eq(space.id, spaceId),
							columns: {
								id: true,
								properties: true,
							},
						});
						invariant(space, 'Space is required for property evaluation');
						spaceProperties = space.properties || [];
					}

					// If no properties to evaluate, skip to finished
					if (!spaceProperties || !spaceProperties.length) {
						await job.updateData({
							...job.data,
							step: PropertyEvaluationStep.Finished,
						});
						step = PropertyEvaluationStep.Finished;
						break;
					}

					// Ensure we have the basic message info
					let workingThreadId = threadId;
					let workingMailReport = job.data.mailReport;

					invariant(messageId, 'messageId must be provided');

					const fetchedMessage = await db.query.message.findFirst({
						where: (message, { eq }) => eq(message.id, messageId),
						columns: {
							id: true,
							threadId: true,
							extractedContent: true,
						},
					});
					invariant(fetchedMessage, 'Message not found');

					workingThreadId = workingThreadId || fetchedMessage.threadId;
					workingMailReport = workingMailReport || fetchedMessage.extractedContent || undefined;

					// Check if we already have mail report
					if (workingMailReport) {
						// We have the mail report, can proceed directly to property evaluation with all our data
						await job.updateData({
							...job.data,
							step: PropertyEvaluationStep.EvaluateProperties,
							messageId,
							threadId: workingThreadId,
							mailReport: workingMailReport,
							properties: spaceProperties,
						});
						step = PropertyEvaluationStep.EvaluateProperties;
					} else {
						// Need to generate mail report, schedule it and wait for it
						await aiQueue.add(
							'generate-mail-report',
							{
								messageId,
								userId,
								accountId,
							},
							{
								parent: {
									id: job.id,
									queue: job.queueQualifiedName,
								},
							},
						);

						await job.updateData({
							...job.data,
							step: PropertyEvaluationStep.WaitingForReport,
							messageId,
							threadId: workingThreadId,
							properties: spaceProperties,
						});
						step = PropertyEvaluationStep.WaitingForReport;
					}
					break;
				}
				case PropertyEvaluationStep.WaitingForReport: {
					const shouldWait = await job.moveToWaitingChildren(token);
					if (shouldWait) {
						throw new WaitingChildrenError();
					}

					// Mail report generated, extract it from children results
					const children = await job.getChildrenValues();
					let mailReport: string | undefined;

					if (children && Object.keys(children).length > 0) {
						const reportResult = Object.values(children)[0] as {
							report?: string;
						};
						mailReport = reportResult?.report;
					}

					if (!mailReport) {
						throw new Error('Failed to get mail report from child job');
					}

					await job.updateData({
						...job.data,
						step: PropertyEvaluationStep.EvaluateProperties,
						mailReport,
					});
					step = PropertyEvaluationStep.EvaluateProperties;
					break;
				}
				case PropertyEvaluationStep.EvaluateProperties: {
					// By this step, messageId, mailReport, and properties definitely exist
					const { messageId, mailReport, properties } = job.data;
					invariant(messageId, 'messageId must exist by EvaluateProperties step');
					invariant(mailReport, 'mailReport must exist by EvaluateProperties step');
					invariant(properties, 'properties must exist by EvaluateProperties step');

					// Schedule property evaluation in AI queue
					await aiQueue.add(
						'evaluate-properties',
						{
							userId,
							accountId,
							messageId,
							mailReport,
							properties,
						},
						{
							parent: {
								id: job.id,
								queue: job.queueQualifiedName,
							},
						},
					);

					await job.updateData({
						...job.data,
						step: PropertyEvaluationStep.WaitingForPropertyEvaluation,
					});
					step = PropertyEvaluationStep.WaitingForPropertyEvaluation;
					break;
				}
				case PropertyEvaluationStep.WaitingForPropertyEvaluation: {
					const { threadId, messageId, spaceId } = job.data;
					invariant(threadId, 'threadId must exist by WaitingForPropertyEvaluation step');

					const shouldWait = await job.moveToWaitingChildren(token);
					if (shouldWait) {
						throw new WaitingChildrenError();
					}

					// Properties evaluated, extract results
					const children = await job.getChildrenValues();
					const propertyResults: { [property: string]: string | boolean | number } = {};

					// Process the results from property evaluation
					if (children && Object.keys(children).length > 0) {
						const evaluationResult = Object.values(children)[0] as {
							results: Array<{ property: string; value: string }>;
						};
						if (evaluationResult?.results) {
							for (const result of evaluationResult.results) {
								propertyResults[result.property] = result.value;
							}
						}
					}

					// Upsert evaluated properties into SpaceProperty rows
					for (const [propertyKey, propertyValue] of Object.entries(propertyResults)) {
						await db
							.insert(spaceProperty)
							.values({
								id: createId(),
								threadId,
								accountId,
								spaceId,
								key: propertyKey,
								value: propertyValue,
							})
							.onConflictDoUpdate({
								target: [spaceProperty.threadId, spaceProperty.spaceId, spaceProperty.key],
								set: { value: propertyValue },
							});
					}

					// Check for space action triggers after property evaluation is complete
					await checkAndQueueSpaceActions(accountId, { threadId, messageId });

					await job.updateData({
						...job.data,
						step: PropertyEvaluationStep.Finished,
						propertyResults,
					});
					step = PropertyEvaluationStep.Finished;
					break;
				}
				default:
					throw new Error('Invalid property evaluation step');
			}
		}
		return PropertyEvaluationStep.Finished;
	},
	{
		connection,
		prefix: env.get('BULLMQ_QUEUE_PREFIX'),
	},
);

// Setup error handlers for property evaluation worker
setupWorkerErrorHandlers(propertyEvaluationWorker, {
	getJobContext: (job) => {
		const { accountId, messageId, mailReport, properties } = job.data;
		return {
			accountId,
			messageId,
			hasMailReport: !!mailReport,
			propertiesCount: properties?.length ?? 0,
		};
	},
	getErrorMessage: () => 'Failed to evaluate properties',
});
