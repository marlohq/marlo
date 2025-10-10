import { RiApps2Fill } from '@remixicon/react';
import type { CategoryId } from '@workspace/categories/types.js';
import { BUILTIN_SPACES } from '@workspace/core/space.js';
import type { SpaceData } from '@workspace/sync-data/data.js';
import { invariant } from 'es-toolkit';
import type { ClientThread } from '../threads/model.ts';
import { getCategoryClientModule } from './categories.ts';
import { formatDateRange, getSpaceDisplayName } from './util.ts';

// Categories that should be bundled together
const BUNDLED_APPS = new Set<CategoryId>([
	'promotions',
	'newsletters',
	'receipts',
	'authentication',
	'delivery',
	'invoice',
	'reservation',
	'calendar',
	'junk',
]);

function getBundleOverrides(appId: CategoryId, threads: ClientThread[]) {
	const firstThread = threads[0];
	invariant(firstThread, 'thread array cannot be empty');
	const firstMessage = firstThread.messages[0];
	if (appId === 'receipts') {
		const senderTotals = new Map<string, { name: string; total: number }>();
		for (const thread of threads) {
			const firstMessage = thread.messages[0];
			const senderUniqueId = firstMessage.senderEmail;
			const receiptData = thread.getCategoryProperties('receipts');
			const total = receiptData.total || 0;
			if (senderTotals.has(senderUniqueId)) {
				// biome-ignore lint/style/noNonNullAssertion: Allowed here.
				senderTotals.get(senderUniqueId)!.total += total || 0;
			} else {
				senderTotals.set(senderUniqueId, {
					name: firstMessage.senderName || firstMessage.senderEmail,
					total: total || 0,
				});
			}
		}

		const sortedSenders = Array.from(senderTotals.values()).sort((a, b) => b.total - a.total);
		const sendersCount = sortedSenders.length;
		const firstSender = sortedSenders[0];
		const secondSender = sortedSenders[1];
		const thirdSender = sortedSenders[2];

		if (!firstSender) {
			return {};
		}
		let message: string;
		if (!secondSender) {
			message = `New receipts from ${firstSender.name}`;
		} else if (!thirdSender) {
			message = `New receipts from ${firstSender.name} and ${secondSender.name}`;
		} else if (sortedSenders.length <= 3) {
			message = `New receipts from ${firstSender.name}, ${secondSender.name}, and ${thirdSender.name}`;
		} else {
			const otherCount = sendersCount - 3;
			message = `New receipts from ${firstSender.name}, ${secondSender.name}, ${thirdSender.name}, and ${otherCount} other${otherCount === 1 ? '' : 's'}.`;
		}
		return { short: message, long: message };
	}

	if (appId === 'junk') {
		const senderNames = [...new Set(threads.map((t) => t.messages[0]?.senderName).filter(Boolean))];
		if (threads.length === 1) {
			return {
				subtitle: `${firstMessage.senderName}: ${firstThread.subject}`,
				short: `This thread was labeled junk. Please confirm that you don't recognize the sender.`,
			};
		}
		return {
			subtitle: `From: ${senderNames.join(', ')}`,
			short: `These senders were labeled junk. Please confirm that you don't recognize them.`,
		};
	}
}
export function organizeByApp(threads: ClientThread[]) {
	const ungroupedThreads: ClientThread[] = [];
	const groupedThreads = threads.reduce(
		(acc, thread) => {
			let didAdd = false;
			const categoryId = thread.category as CategoryId | null;
			if (categoryId && BUNDLED_APPS.has(categoryId)) {
				const category = getCategoryClientModule(categoryId);
				if (!acc[categoryId]) {
					acc[categoryId] = {
						type: 'app' as const,
						appId: categoryId,
						threads: [thread] as [ClientThread, ...ClientThread[]],
						title: category.name,
						short: undefined,
						long: undefined,
						subtitle: undefined,
						timestamp: thread.lastSentAt,
						to: `/apps/${categoryId}`,
						icon: <category.icon className="size-full" />,
					};
				} else {
					acc[categoryId].threads.push(thread);
				}
				didAdd = true;
			}
			if (!didAdd) {
				ungroupedThreads.push(thread);
			}

			return acc;
		},
		{} as Record<
			string,
			{
				type: 'app';
				appId: CategoryId;
				to: string;
				title: string;
				subtitle: string | undefined;
				short: string | undefined;
				long: string | undefined;
				timestamp: Date;
				threads: [ClientThread, ...ClientThread[]];
				icon: React.ReactNode;
			}
		>,
	);

	return {
		groups: Object.values(groupedThreads)
			.map((g) => ({
				...g,
				...getBundleOverrides(g.appId as CategoryId, g.threads),
			}))
			.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
		remaining: ungroupedThreads,
	};
}

function organizeBySpace(threads: ClientThread[], spaces: SpaceData[]) {
	const ungroupedThreads: ClientThread[] = [];
	const groupedThreads = threads.reduce(
		(acc, thread) => {
			let didAdd = false;
			const spaceId = thread.spaceId ?? null;
			if (spaceId && !Object.keys(BUILTIN_SPACES).includes(spaceId)) {
				const space = spaces.find((s) => s.id === spaceId);
				if (space) {
					if (!acc[spaceId]) {
						acc[spaceId] = {
							type: 'space' as const,
							spaceId: spaceId,
							threads: [thread] as [ClientThread, ...ClientThread[]],
							title: getSpaceDisplayName(space.name),
							short: undefined,
							long: undefined,
							subtitle: undefined,
							timestamp: thread.lastSentAt,
							to: `/spaces/${spaceId}`,
							icon: <RiApps2Fill className="size-full" />,
						};
					} else {
						acc[spaceId].threads.push(thread);
					}
					didAdd = true;
				}
			}
			if (!didAdd) {
				ungroupedThreads.push(thread);
			}

			return acc;
		},
		{} as Record<
			string,
			{
				type: 'space';
				spaceId: string;
				to: string;
				title: string;
				subtitle: string | undefined;
				short: string | undefined;
				long: string | undefined;
				timestamp: Date;
				threads: [ClientThread, ...ClientThread[]];
				icon: React.ReactNode | undefined;
			}
		>,
	);

	return {
		groups: Object.values(groupedThreads).sort(
			(a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
		),
		remaining: ungroupedThreads,
	};
}

export function organizeThreadsBySender(threads: ClientThread[]) {
	const data = threads.reduce(
		(acc, thread) => {
			const senderEmail = thread.messages[0].senderEmail;
			if (!acc[senderEmail]) {
				acc[senderEmail] = [thread];
			} else {
				acc[senderEmail].push(thread);
			}
			return acc;
		},
		{} as Record<string, [ClientThread, ...ClientThread[]]>,
	);
	const groupedThreads = Object.entries(data)
		.map(([senderEmail, threads]) => {
			const firstThread = threads[0];
			const firstMessage = firstThread.messages[0];
			const isAllSendersTheSameName =
				!!firstMessage.senderName &&
				threads.every((t) => t.messages.every((m) => m.senderName === firstMessage.senderName));
			return {
				type: 'sender' as const,
				threads,
				title:
					threads.length === 1
						? threads[0].subject
						: isAllSendersTheSameName
							? firstMessage.senderName || firstMessage.senderEmail
							: firstMessage.senderEmail,
				subtitle: undefined,
				short: undefined,
				long: undefined,
				timestamp: firstThread.lastSentAt,
				to: `/search?q=from:${senderEmail}`,
				icon: undefined,
			};
		})
		.filter(Boolean)
		.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

	return {
		groups: groupedThreads,
	};
}

function organizeThreadsbyDate(threads: ClientThread[]) {
	// Sort threads by timestamp (most recent first)
	const sortedThreads = [...threads].sort(
		(a, b) => b.lastSentAt.getTime() - a.lastSentAt.getTime(),
	);

	// Group by day while preserving order
	const threadsByDay: { date: string; threads: ClientThread[] }[] = [];
	let currentDay: { date: string; threads: ClientThread[] } | null = null;

	for (const thread of sortedThreads) {
		const dateKey = thread.lastSentAt.toDateString();

		if (!currentDay || currentDay.date !== dateKey) {
			currentDay = { date: dateKey, threads: [thread] };
			threadsByDay.push(currentDay);
		} else {
			currentDay.threads.push(thread);
		}
	}

	// Create batches of roughly 10, keeping same-day threads together
	const batches: ClientThread[][] = [];
	let currentBatch: ClientThread[] = [];

	for (const day of threadsByDay) {
		// If adding this day would make batch too big and current batch isn't empty
		if (
			currentBatch.length > 0 &&
			(currentBatch.length > 8 || currentBatch.length + day.threads.length > 12)
		) {
			batches.push(currentBatch);
			currentBatch = [...day.threads];
		} else {
			currentBatch.push(...day.threads);
		}
	}

	// Add remaining batch if not empty
	if (currentBatch.length > 0) {
		batches.push(currentBatch);
	}

	// Create group objects
	const groups = batches.map((batchThreads) => {
		invariant(batchThreads.length > 0, 'batch cannot be empty');
		const firstThread = batchThreads[0]; // Most recent
		const lastThread = batchThreads[batchThreads.length - 1]; // Oldest in batch
		invariant(firstThread, 'first thread cannot be undefined');
		invariant(lastThread, 'last thread cannot be undefined');

		return {
			type: 'date' as const,
			threads: batchThreads as [ClientThread, ...ClientThread[]],
			title: formatDateRange(lastThread.lastSentAt, firstThread.lastSentAt),
			subtitle: undefined,
			short: undefined,
			long: undefined,
			timestamp: firstThread.lastSentAt,
			to: undefined,
			icon: undefined,
		};
	});

	return groups;
}
