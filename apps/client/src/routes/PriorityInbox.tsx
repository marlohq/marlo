import { RiArrowDownSFill, RiArrowRightSFill, RiInbox2Fill } from '@remixicon/react';
import type { Database } from '@workspace/local/database.js';
import { useQuery } from '@workspace/local/query.js';
import { isBefore, startOfDay, subDays } from 'date-fns';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { VirtuosoHandle } from 'react-virtuoso';
import {
	useCommandPalette,
	useCommandPaletteActions,
} from '../components/CommandPalette/context.tsx';
import {
	type CustomRowItem,
	type HeaderRowItem,
	type ThreadRowItem,
	ThreadTableList,
} from '../components/ThreadTableList.tsx';
import { useCurrentAccount } from '../hooks/useCurrentAccount.tsx';
import { DEFAULT_THREAD_QUERY_LIMIT, getPriorityInboxQuery } from '../lib/queries.ts';
import { ClientThread } from '../threads/model.ts';

function getGreeting(): string {
	const hour = new Date().getHours();
	if (hour >= 5 && hour < 12) {
		return 'Good morning';
	} else if (hour >= 12 && hour < 18) {
		return 'Good afternoon';
	} else {
		return 'Good evening';
	}
}

function getDBQuery(db: Database) {
	return getPriorityInboxQuery(db).limit(DEFAULT_THREAD_QUERY_LIMIT);
}

export function Component() {
	const currentAccount = useCurrentAccount();
	const { isOpen: isCommandPaletteOpen } = useCommandPalette();
	const { setPageContext, setNavigationHistory } = useCommandPaletteActions();
	const [inboxThreadsResult, inboxThreadsQuery] = useQuery((db) => getDBQuery(db).toArray());
	const dailyBriefRef = useRef<HTMLElement | null>(null);
	const threads = useMemo(
		() => inboxThreadsResult?.map((item) => new ClientThread(item.data)) ?? [],
		[inboxThreadsResult],
	);
	const isEmptyLoading = inboxThreadsQuery.status !== 'complete' && threads.length === 0;
	const isEmptyComplete = inboxThreadsQuery.status === 'complete' && threads.length === 0;
	const isDataLoading = inboxThreadsQuery.status !== 'complete';
	const [isShowHiddenThreads, setIsShowHiddenThreads] = useState(false);
	const ref = useRef<VirtuosoHandle | null>(null);

	useEffect(() => {
		setNavigationHistory({
			to: '/',
			ids: threads.map((thread) => thread.id),
		});
	}, [threads, setNavigationHistory]);

	const { active, stale, calendarInvites } = useMemo(() => {
		const staleThreads: ClientThread[] = [];
		const calendarInviteThreads: ClientThread[] = [];
		const activeItems: Array<{ type: 'thread'; thread: ClientThread }> = [];
		const activeInboxThreads: ClientThread[] = [];

		// Calculate 30 days ago
		const thirtyDaysAgo = startOfDay(subDays(new Date(), 30));

		for (const thread of threads) {
			// Check if thread is stale (older than 30 days)
			if (isBefore(thread.lastSentAt, thirtyDaysAgo)) {
				staleThreads.push(thread);
				continue;
			}
			// Calendar invitations are their own section and are excluded from Active
			if (
				thread.category === 'calendar' &&
				thread.getCategoryProperties('calendar')?.kind === 'invitation'
			) {
				calendarInviteThreads.push(thread);
				continue;
			}
			// Everything else is considered active.
			activeInboxThreads.push(thread);
		}

		// Process active inbox threads into activeItems
		const seenBundles = new Set<string>();
		for (const thread of activeInboxThreads) {
			activeItems.push({ type: 'thread', thread });
		}

		return { active: activeItems, stale: staleThreads, calendarInvites: calendarInviteThreads };
	}, [threads]);

	useEffect(() => {
		setPageContext({
			title: { text: 'Inbox' },
			view: { type: 'root' },
		});
	}, [setPageContext]);

	const data = useMemo(() => {
		const isIncludeHeaders =
			Math.min(active.length, 1) +
				Math.min(stale.length, 1) +
				Math.min(calendarInvites.length, 1) >=
			2;
		const isExpandStale = isShowHiddenThreads || active.length === 0;
		const newTableData = [
			...(calendarInvites.length > 0 && isIncludeHeaders
				? [
						{
							id: 'calendar-header',
							key: 'calendar-header',
							type: 'header',
							title: 'RSVP',
						} as HeaderRowItem,
					]
				: []),
			...(calendarInvites.length > 0
				? calendarInvites.map((thread) => ({
						id: thread.id,
						key: `THREAD:${thread.id}`,
						type: 'thread',
						thread,
					}))
				: []),
			...(active.length > 0 && isIncludeHeaders
				? [
						{
							id: 'inbox-header',
							key: 'inbox-header',
							type: 'header',
							title: 'Active',
						},
					]
				: []),
			...(active.length > 0
				? active.map((item) => ({
						id: item.thread.id,
						key: `THREAD:${item.thread.id}`,
						type: 'thread',
						thread: item.thread,
					}))
				: []),
			...(stale.length > 0 && isIncludeHeaders
				? [
						{
							id: `CUSTOM:show-hidden`,
							key: `CUSTOM:show-hidden`,
							type: 'custom',
							render: () => (
								<div className="flex h-[58px] items-center justify-between gap-4 px-4 pr-7 pt-4 leading-none text-neutral-500 sm:px-10">
									<button
										type="button"
										className="flex items-center gap-0.5 py-2 hover:text-neutral-900"
										onClick={() => setIsShowHiddenThreads((prev) => !prev)}
									>
										<span className="">{`Stale (${stale.length < 100 ? stale.length : '99+'})`}</span>

										{isExpandStale ? (
											<RiArrowDownSFill className="size-5" />
										) : (
											<RiArrowRightSFill className="size-5" />
										)}
									</button>
								</div>
							),
						},
					]
				: []),
			...(isExpandStale
				? stale.map((thread) => ({
						id: thread.id,
						key: `THREAD:${thread.id}`,
						type: 'thread',
						thread,
					}))
				: []),
		] as (HeaderRowItem | CustomRowItem | ThreadRowItem)[];
		return newTableData;
	}, [active, stale, calendarInvites, isShowHiddenThreads]);

	if (isEmptyLoading) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<div className="text-neutral-500">Loading...</div>
			</div>
		);
	}

	if (threads.length === 0) {
		return (
			<div className="flex h-full w-full items-center justify-center text-neutral-500">
				<div className="flex items-center gap-1">
					<RiInbox2Fill className="size-4 text-neutral-900" />
					<span className="font-medium text-neutral-900">Priority</span>
					<span>is empty.</span>
				</div>
			</div>
		);
	}

	return (
		<>
			<div className="flex h-40 shrink-0 items-center px-4 pb-2 sm:px-10">
				<div className="flex flex-col gap-0.5">
					<div className="text-[28px] font-semibold leading-8">
						{getGreeting()}, {currentAccount.name.split(' ')[0]}.
					</div>
					<div className="text-lg text-neutral-500">
						You have {threads.length} threads to resolve.
					</div>
				</div>
				<div className="flex-1" />
			</div>
			<ThreadTableList
				id={`inbox`}
				ref={ref}
				island={true}
				autoFocus={true}
				data={data}
				isActive={() => !isCommandPaletteOpen}
				onFocusEscape={(direction) => {
					if (direction === 'up') {
						dailyBriefRef.current?.focus();
					}
				}}
				footer={() => <div className="h-6" />}
			/>
		</>
	);
}
