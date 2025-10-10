import type { z } from 'zod';
import type { Space } from './drizzle.ts';
import { env } from './env.ts';
import type { Mail } from './mail-parser.ts';
import type { Job, JobOptions } from './queue-exports.ts';
import { createQueue, type Queue } from './queue-exports.ts';
import { connection } from './redis-connection.ts';
import type { syncActionsSchema } from './remote-sync.ts';
import type { SpaceProperties, SpaceProperty } from './space.ts';
import type { MailReport } from './types.ts';

export enum MailIngestionStep {
	IngestMessage = 0,
	WaitingForAttachmentsAndReport = 1,
	TagMessage = 2,
	WaitingForTagging = 3,
	FilterForSpace = 4,
	WaitingForFiltering = 5,
	Finished = 6,
}

export enum FilterForSpaceStep {
	GetSpace = 0,
	WaitingForNaturalQueries = 1,
	EvaluateFilters = 2,
	Finished = 3,
}

export enum PropertyEvaluationStep {
	PrepareData = 0,
	WaitingForReport = 1,
	EvaluateProperties = 2,
	WaitingForPropertyEvaluation = 3,
	Finished = 4,
}

export type MailIngestionJobData = {
	step: MailIngestionStep;
	userId: string;
	accountId: string;
	remoteMessageId: string;
	remoteThreadId: string;
	// Data that comes in during the task
	insertedMessageId?: string;
	shouldTagMessage?: boolean;
	parsedMail?: Mail;
	mailReport?: MailReport;
};

export const mailProcessQueue = createQueue('mailProcessQueue', {
	defaultJobOptions: {
		attempts: 7,
		backoff: {
			type: 'exponential',
			delay: 3000,
		},
		removeOnComplete: 2500,
		removeOnFail: 5000,
	},
	connection,
	prefix: env.get('BULLMQ_QUEUE_PREFIX'),
});

export const filterForSpaceQueue = createQueue('filterForSpaceQueue', {
	defaultJobOptions: {
		attempts: 3,
		backoff: {
			type: 'exponential',
			delay: 5000,
		},
		removeOnComplete: 100,
		removeOnFail: 500,
	},
	connection,
	prefix: env.get('BULLMQ_QUEUE_PREFIX'),
});

export const propertyEvaluationQueue = createQueue('propertyEvaluationQueue', {
	defaultJobOptions: {
		attempts: 3,
		backoff: {
			type: 'exponential',
			delay: 5000,
		},
		removeOnComplete: 100,
		removeOnFail: 500,
	},
	connection,
	prefix: env.get('BULLMQ_QUEUE_PREFIX'),
});

export interface SyncActionData {
	action: z.infer<typeof syncActionsSchema>;
	accountId: string;
	remoteThreadId: string;
	remoteMessageId?: string;
}

export const syncActionToRemoteQueue = createQueue('sync-action-to-remote', {
	connection,
	prefix: env.get('BULLMQ_QUEUE_PREFIX'),
	defaultJobOptions: {
		// We get a lot of this, so we don't need/want to keep it around for long.
		removeOnComplete: 100,
		removeOnFail: 500,
		attempts: 5,
		backoff: {
			type: 'exponential',
			delay: 3000,
		},
	},
});

// Base fields shared by all AI worker jobs
type BaseAiWorkerJobData = {
	userId: string;
	accountId: string;
	messageId: string;
};

// Specific job data types for each AI worker operation
export type ProcessAttachmentJobData = BaseAiWorkerJobData & {
	remoteMessageId: string;
	attachments: Mail['attachments'];
};

export type GenerateMailReportJobData = BaseAiWorkerJobData & {
	parsedMail?: Mail;
};

export type TagMessageJobData = BaseAiWorkerJobData & {
	parsedMail?: Mail;
	mailReport: MailReport;
};

export type EvaluateNaturalQueriesJobData = BaseAiWorkerJobData & {
	mailReport: MailReport;
	queries: string[];
};

export type EvaluatePropertiesJobData = BaseAiWorkerJobData & {
	mailReport: MailReport;
	properties: SpaceProperties;
};

export type UpdateInferredContactProfileJobData = {
	userId: string;
	accountId: string;
	contactEmail: string;
};

// Mapping of job names to their data types
export type AiJobNameToDataMap = {
	'process-attachment': ProcessAttachmentJobData;
	'generate-mail-report': GenerateMailReportJobData;
	'tag-message': TagMessageJobData;
	'evaluate-natural-queries': EvaluateNaturalQueriesJobData;
	'evaluate-properties': EvaluatePropertiesJobData;
	'update-inferred-contact-profile': UpdateInferredContactProfileJobData;
};

export type AiJobName = keyof AiJobNameToDataMap;

type AllAiWorkerJobData =
	| ProcessAttachmentJobData
	| GenerateMailReportJobData
	| TagMessageJobData
	| EvaluateNaturalQueriesJobData
	| EvaluatePropertiesJobData
	| UpdateInferredContactProfileJobData;

// Type-safe queue that maps job names to their data types
export interface TypeSafeAiQueue extends Omit<Queue<AllAiWorkerJobData>, 'add' | 'addBulk'> {
	add<T extends AiJobName>(
		name: T,
		data: AiJobNameToDataMap[T],
		opts?: JobOptions,
	): Promise<Job<AiJobNameToDataMap[T], unknown, T>>;

	addBulk<T extends AiJobName>(
		jobs: Array<{
			name: T;
			data: AiJobNameToDataMap[T];
			opts?: JobOptions;
		}>,
	): Promise<Job<AiJobNameToDataMap[T], unknown, T>[]>;
}

export type AiWorkerType =
	| Job<ProcessAttachmentJobData, unknown, 'process-attachment'>
	| Job<GenerateMailReportJobData, unknown, 'generate-mail-report'>
	| Job<TagMessageJobData, unknown, 'tag-message'>
	| Job<EvaluateNaturalQueriesJobData, unknown, 'evaluate-natural-queries'>
	| Job<EvaluatePropertiesJobData, unknown, 'evaluate-properties'>
	| Job<UpdateInferredContactProfileJobData, unknown, 'update-inferred-contact-profile'>;

// Job data for space filtering workflow
export type FilterForSpaceJobData = {
	step: FilterForSpaceStep;
	messageData: {
		// Essential message fields for filtering
		id: string;
		accountId: string;
		userId: string;
		threadId: string;
		subject: string;
		senderEmail: string;
		contentText: string | null;
		contentHtml: string | null;
		sentAt: Date;
		// Related data
		thread: {
			remoteId: string;
		};
		messageRecipients: Array<{
			type: 'TO' | 'CC' | 'BCC';
			email: string;
		}>;
		messageAttachments: Array<{
			id: string;
		}>;
		messageLabels: Array<{
			label: {
				id: string;
			};
		}>;
	};
	spaceId: string;
	space?: Pick<Space, 'id' | 'filters' | 'properties'>; // Cached space data to avoid repeated DB calls
	naturalQueryResults?: { [query: string]: boolean }; // Results from AI natural language evaluation
};

// Job data for property evaluation workflow - uses minimal primitive fields only
export type PropertyEvaluationJobData = {
	step: PropertyEvaluationStep;
	userId: string;
	accountId: string;
	messageId: string; // Required - the message to evaluate properties for
	threadId?: string; // Optional - provided for SpaceThreadTag updates, fetched from DB if missing
	properties?: SpaceProperty[]; // Optional - will be fetched from space in PrepareData step if not provided
	spaceId: string; // Required - SpaceId to update with property results
	mailReport?: MailReport; // Optional - will be generated if not provided
	propertyResults?: { [property: string]: string | boolean | number }; // Results stored after AI evaluation
};

// Job data for Space Action execution
export type SpaceActionJobData = {
	actionId: string;
	threadId?: string; // null for cron triggers
	triggerType: 'new_message' | 'manual' | 'cron';
};

export const actionQueue = createQueue('actionQueue', {
	defaultJobOptions: {
		attempts: 3,
		backoff: {
			type: 'exponential',
			delay: 5000,
		},
		removeOnComplete: 1000,
		removeOnFail: 1500,
	},
	connection,
	prefix: env.get('BULLMQ_QUEUE_PREFIX'),
});

export const aiQueue = createQueue('aiQueue', {
	defaultJobOptions: {
		attempts: 3,
		backoff: {
			type: 'exponential',
			delay: 5000,
		},
		// Keep less jobs for the AI queue, for multiple reasons:
		// - They're much heavier, due to containing parsed emails in them
		// - With the volatile nature of AI, we don't really care about deduplication
		removeOnComplete: 1000,
		removeOnFail: 1500,
	},
	connection,
	prefix: env.get('BULLMQ_QUEUE_PREFIX'),
}) as TypeSafeAiQueue;

export async function enqueueTagMessage(data: TagMessageJobData, opts?: JobOptions) {
	return aiQueue.add('tag-message', data, opts);
}

export async function enqueueGenerateMailReport(
	data: GenerateMailReportJobData,
	opts?: JobOptions,
) {
	return aiQueue.add('generate-mail-report', data, opts);
}

export async function enqueueUpdateInferredContactProfile(
	data: UpdateInferredContactProfileJobData,
	opts?: JobOptions,
) {
	return aiQueue.add('update-inferred-contact-profile', data, opts);
}

export async function enqueueFilterForSpace(
	data: Parameters<typeof filterForSpaceQueue.add>[1],
	opts?: Parameters<typeof filterForSpaceQueue.add>[2],
) {
	return filterForSpaceQueue.add('filter-for-space', data, opts);
}

// Helper function to enqueue property evaluation jobs in dedicated queue
export async function enqueuePropertyEvaluation(
	data: Omit<PropertyEvaluationJobData, 'step' | 'propertyResults'>,
	opts?: JobOptions,
) {
	const hasProperties = !!data.properties;
	const hasMailReport = !!data.mailReport;

	let startStep: PropertyEvaluationStep;
	if (hasProperties && hasMailReport) {
		// Have everything, can start property evaluation directly
		startStep = PropertyEvaluationStep.EvaluateProperties;
	} else {
		// Missing data, need to prepare first (either missing properties or missing mail report)
		startStep = PropertyEvaluationStep.PrepareData;
	}

	return propertyEvaluationQueue.add(
		'property-evaluation',
		{
			step: startStep,
			...data,
		},
		opts,
	);
}

// Helper function to enqueue space action jobs
export async function enqueueSpaceActions(
	data: Parameters<typeof actionQueue.add>[1][],
	opts?: Parameters<typeof actionQueue.add>[2],
) {
	return actionQueue.addBulk(
		data.map((d) => ({
			name: 'execute-action',
			data: d,
			opts,
		})),
	);
}
