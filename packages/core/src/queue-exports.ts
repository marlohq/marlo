/**
 * Centralized queue exports for the entire application. This module handles optional BullMQ Pro
 * dependency and provides fallbacks to regular BullMQ when Pro is not available.
 */

// biome-ignore-all lint/suspicious/noTsIgnore: We need to use ts-ignore here to handle optional dependencies
// biome-ignore-all lint/suspicious/noExplicitAny: We need to use any in several places here due to the optional dependency

// Import regular BullMQ normally - this is always available
import {
	type ConnectionOptions as BullMQConnectionOptions,
	FlowProducer as BullMQFlowProducer,
	Queue as BullMQQueue,
	UnrecoverableError as BullMQUnrecoverableError,
	WaitingChildrenError as BullMQWaitingChildrenError,
	Worker as BullMQWorker,
} from 'bullmq';

// Try to import BullMQ Pro (optional)
// @ts-ignore It's okay if this fails
let bullmqPro: typeof import('@taskforcesh/bullmq-pro') | null = null;

try {
	// @ts-ignore It's okay if this fails
	bullmqPro = await import('@taskforcesh/bullmq-pro');
} catch {
	// BullMQ Pro not available, will use regular BullMQ
}

// Export classes, preferring Pro over regular
export const Queue = bullmqPro?.QueuePro ?? BullMQQueue;
export const Worker = bullmqPro?.WorkerPro ?? BullMQWorker;
export const FlowProducer = bullmqPro?.FlowProducerPro ?? BullMQFlowProducer;
export const WaitingChildrenError = bullmqPro?.WaitingChildrenError ?? BullMQWaitingChildrenError;
export const UnrecoverableError = bullmqPro?.UnrecoverableError ?? BullMQUnrecoverableError;

export function createQueue<T = any>(name: string, opts?: QueueOptions) {
	// @ts-ignore: It's easier downstream to assume that it is a BullMQ Queue
	return new Queue(name, opts) as Queue<T>;
}

// Type exports - these are now proper union types instead of any
export type Queue<T = any> =
	// @ts-ignore Optional dependency might not be present
	import('@taskforcesh/bullmq-pro').QueuePro<T> | import('bullmq').Queue<T>;

export type Worker<T = any, R = any, N extends string = string> =
	// @ts-ignore Optional dependency might not be present
	import('@taskforcesh/bullmq-pro').WorkerPro<T, R, N> | import('bullmq').Worker<T, R, N>;

export type Job<T = any, R = any, N extends string = string> =
	// @ts-ignore Optional dependency might not be present
	import('@taskforcesh/bullmq-pro').JobPro<T, R, N> | import('bullmq').Job<T, R, N>;

// @ts-ignore Optional dependency might not be present
export type JobPro = import('@taskforcesh/bullmq-pro').JobPro;

export type JobOptions =
	// @ts-ignore Optional dependency might not be present
	import('@taskforcesh/bullmq-pro').JobsProOptions | import('bullmq').JobsOptions;

export type QueueOptions =
	// @ts-ignore Optional dependency might not be present
	import('@taskforcesh/bullmq-pro').QueueProOptions | import('bullmq').QueueOptions;

export type ConnectionOptions =
	// @ts-ignore Optional dependency might not be present
	import('@taskforcesh/bullmq-pro').ConnectionOptions | BullMQConnectionOptions;
