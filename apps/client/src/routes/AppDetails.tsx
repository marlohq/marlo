import { invariant } from 'es-toolkit';
import { useEffect, useMemo, useRef } from 'react';
import { useLocation, useParams } from 'react-router';
import type { VirtuosoHandle } from 'react-virtuoso';
import {
	useCommandPalette,
	useCommandPaletteActions,
} from '../components/CommandPalette/context.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { ThreadTableList } from '../components/ThreadTableList.tsx';
import { useInfiniteQuery } from '../hooks/useInfiniteQuery.ts';
import { type CategoryClientModule, getCategoryClientModule } from '../lib/categories.ts';
import { listThreadsForAppQuery } from '../lib/queries.ts';
import { agentDebugger } from '../lib/timer.ts';
import { ClientThread } from '../threads/model.ts';

function useAppParam(): CategoryClientModule {
	const { pathname } = useLocation();
	const { id } = useParams();
	invariant(id, `Invalid route, expected "/apps/:id" but got "${pathname}".`);
	const category = getCategoryClientModule(id);
	invariant(category, `Invalid route, no category ${id} found.`);
	return category;
}

export function Component() {
	// Grab the app id from the pathname: /apps/:id
	// We do this because the app id is not a param, it's a static path segment (e.g. /apps/github, not /apps/:id)
	const { isOpen } = useCommandPalette();
	const category = useAppParam();
	const ref = useRef<VirtuosoHandle | null>(null);
	const { rows, onEndReached, info, limit } = useInfiniteQuery(
		(db) => listThreadsForAppQuery(db, category.id),
		[category.id],
	);
	const threads = rows?.map((r) => new ClientThread(r.data)) ?? [];
	const isEmpty = info.status === 'complete' && threads.length === 0;
	const isEmptyLoading = info.status !== 'complete' && threads.length === 0;

	agentDebugger.useTimer(category.id, { status: info.status });
	const { setPageContext } = useCommandPaletteActions();

	useEffect(() => {
		setPageContext({
			title: { text: category.name },
			view: { type: 'root' },
		});
	}, [setPageContext, category.name]);

	const tableData = useMemo(() => {
		const inboxGroup = threads.filter((t) => !t.resolvedAt);
		const resolvedGroup = threads.filter((t) => t.resolvedAt);
		if (inboxGroup.length === 0 && resolvedGroup.length === 0) {
			return [];
		}
		return [
			inboxGroup.length > 0 && {
				id: 'HEADER:INBOX',
				type: 'header' as const,
				title: 'Inbox',
			},
			...inboxGroup.map((t) => ({
				id: t.id,
				type: 'thread' as const,
				thread: t,
			})),
			resolvedGroup.length > 0 && {
				id: 'HEADER:RESOLVED',
				type: 'header' as const,
				title: 'Resolved',
			},
			...resolvedGroup.map((t) => ({
				id: t.id,
				type: 'thread' as const,
				thread: t,
			})),
		].filter(Boolean);
	}, [threads]);

	return (
		<div className="mx-auto flex h-full w-full flex-col py-1">
			{isEmptyLoading ? null : isEmpty ? (
				<EmptyState message={'No threads.'} />
			) : (
				<ThreadTableList
					id={`app:${category.id}`}
					ref={ref}
					island={true}
					autoFocus={true}
					data={tableData}
					isActive={() => !isOpen}
					onEndReached={onEndReached}
				/>
			)}
		</div>
	);
}
