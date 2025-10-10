import { RiArchiveStackFill } from '@remixicon/react';
import type { Database } from '@workspace/local/database.js';
import { useQuery } from '@workspace/local/query.js';
import { Button } from '@workspace/ui';
import { isToday, isYesterday } from 'date-fns';
import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router';
import type { VirtuosoHandle } from 'react-virtuoso';
import {
	useCommandPalette,
	useCommandPaletteActions,
} from '../components/CommandPalette/context.tsx';
import {
	type HeaderRowItem,
	type ThreadRowItem,
	ThreadTableList,
} from '../components/ThreadTableList.tsx';
import { ZapIcon } from '../icons/ZapIcon.tsx';
import { DEFAULT_THREAD_QUERY_LIMIT, getTriageInboxQuery } from '../lib/queries.ts';
import { ClientThread } from '../threads/model.ts';

function getDBQuery(db: Database) {
	return getTriageInboxQuery(db).limit(DEFAULT_THREAD_QUERY_LIMIT);
}

export function Component() {
	const { isOpen: isCommandPaletteOpen } = useCommandPalette();
	const { setPageContext, setNavigationHistory } = useCommandPaletteActions();
	const [inboxThreadsResult, inboxThreadsQuery] = useQuery((db) => getDBQuery(db).toArray());
	const threads = inboxThreadsResult?.map((item) => new ClientThread(item.data)) ?? [];
	const isEmptyLoading = inboxThreadsQuery.status !== 'complete' && threads.length === 0;
	const ref = useRef<VirtuosoHandle | null>(null);

	const rows = useMemo(() => {
		const threadsByDay = organizeThreadsByDay(threads);
		const result = Object.entries(threadsByDay).flatMap(([day, threads]) => [
			{
				id: day,
				key: `DAY:${day}`,
				type: 'header',
				title: day,
			} as HeaderRowItem,
			...(threads.map((thread) => ({
				id: thread.id,
				key: `THREAD:${thread.id}`,
				type: 'thread',
				thread,
			})) as ThreadRowItem[]),
		]);
		if (Object.keys(threadsByDay).length === 1) {
			result.shift();
		}
		return result;
	}, [threads]);

	useEffect(() => {
		setPageContext({
			title: { text: 'Triage' },
			view: { type: 'root' },
		});
	}, [setPageContext]);

	// Track navigation history so ThreadDetails Escape navigates back here
	useEffect(() => {
		setNavigationHistory({
			to: '/triage',
			ids: inboxThreadsResult?.map((t) => t.data.id) ?? [],
		});
	}, [inboxThreadsResult, setNavigationHistory]);

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
					<RiArchiveStackFill className="size-4 text-neutral-900" />
					<span className="font-medium text-neutral-900">Triage</span>
					<span>is empty.</span>
				</div>
			</div>
		);
	}

	return (
		<>
			<div className="flex h-40 shrink-0 items-center px-4 pb-2 sm:pl-10">
				<div className="flex flex-col gap-0.5">
					<div className="text-[28px] font-semibold leading-8">Triage</div>
					<div className="text-lg text-neutral-500">
						New threads arrive here. You have {threads.length} threads to triage.
					</div>
				</div>
				<div className="flex-1" />
				<Button
					asChild
					size="lg"
					className="shrink-0 overflow-hidden bg-blue-600 pl-2.5 pr-1.5 text-white hover:bg-blue-700"
				>
					<Link to="/triage/inbox-zero">
						<ZapIcon className="size-4" />
						<span className="font-medium">Get to Inbox Zero</span>
						<span className="flex-1" />
						<span className="rounded-md px-1.5 py-0.5 text-white/80">
							{(() => {
								// Calculate an estimated time using logarithmic run-off.
								const base = 20;
								const n = threads.length;
								const minutes = Math.max(1, Math.ceil(Math.log2(n / base + 1)));
								return `${minutes} min`;
							})()}
						</span>
					</Link>
				</Button>
			</div>
			<ThreadTableList
				id={`inbox`}
				ref={ref}
				island={true}
				autoFocus={true}
				data={rows}
				isActive={() => !isCommandPaletteOpen}
			/>
		</>
	);
}

function organizeThreadsByDay(threads: ClientThread[]) {
	const threadsByDay = threads.reduce(
		(acc, thread) => {
			let day = thread.lastSentAt.toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'long',
				day: 'numeric',
			});
			if (isToday(thread.lastSentAt)) {
				day = `Today`;
			} else if (isYesterday(thread.lastSentAt)) {
				day = `Yesterday`;
			}
			if (!acc[day]) {
				acc[day] = [];
			}
			// biome-ignore lint/style/noNonNullAssertion: Asserted by the previous check
			acc[day]!.push(thread);
			return acc;
		},
		{} as Record<string, ClientThread[]>,
	);
	return threadsByDay;
}
