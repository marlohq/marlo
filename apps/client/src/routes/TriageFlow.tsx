import { safe } from '@orpc/client';
import { RiArrowRightLine, RiCheckDoubleLine, RiInbox2Fill, RiMoreFill } from '@remixicon/react';
import { type Database, getDatabase } from '@workspace/local/database.js';
import { useQuery } from '@workspace/local/query.js';
import { Button } from '@workspace/ui';
import { memoize } from 'es-toolkit';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { VirtuosoHandle } from 'react-virtuoso';
import { isInputField, isKeyEventMatch } from '../commands/util.ts';
import {
	useCommandPalette,
	useCommandPaletteActions,
} from '../components/CommandPalette/context.tsx';
import { KeyboardShortcutBadge } from '../components/KeyboardShortcutBadge.tsx';
import { MessageCard } from '../components/ThreadDetails/MessageCard.tsx';
import { ThreadEmbedList } from '../components/ThreadEmbedList.tsx';
import type { ThreadRowItem } from '../components/ThreadTableList.tsx';
import { useDocumentEventListener } from '../hooks/useDocumentEventListener.ts';
import { ImportantIcon } from '../icons/ImportantIcon.tsx';
import { actions } from '../lib/actions.ts';
import { organizeByApp, organizeThreadsBySender } from '../lib/bundles.tsx';
import { getCategoryClientModule } from '../lib/categories.ts';
import { DEFAULT_THREAD_QUERY_LIMIT, getTriageInboxQuery, threadsQuery } from '../lib/queries.ts';
import { cn, getFirstOpenedMessageIndex } from '../lib/util.ts';
import { ClientMessage } from '../models/message.ts';
import { ClientThread } from '../threads/model.ts';

function getDBQuery(db: Database) {
	return getTriageInboxQuery(db).limit(DEFAULT_THREAD_QUERY_LIMIT);
}

function getHighlights(threads: ClientThread[]) {
	const { groups: appHighlights, remaining: remainingGroupA } = organizeByApp(threads);
	const { groups: senderHighlights } = organizeThreadsBySender(remainingGroupA);

	// Combine all groups and sort by timestamp (most recent first)
	const allGroups = [...appHighlights, ...senderHighlights];
	return allGroups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

type CardData = ReturnType<typeof getHighlights>[number];

const getSummary = memoize(
	async (card: CardData) => {
		const threads = card?.threads ?? [];
		if (threads.length === 0) {
			return { highlights: [] };
		}
		return await safe(
			actions.inbox.analyzeBundleSummary({
				threads: threads.map((t) => t.id),
				title: card.title,
				type: card.type === 'app' ? 'category' : 'sender',
			}),
		).then((result) => {
			return { highlights: result.data?.result ?? [] };
		});
	},
	{ getCacheKey: (card) => card.to },
);

export function Component() {
	const { setPageContext } = useCommandPaletteActions();
	const [initialCards, setInitialCards] = useState<CardData[] | null>(null);
	const [isInitialLoading, setIsInitialLoading] = useState(true);

	useEffect(() => {
		console.log('Setting page context: root');
		setPageContext({
			title: { text: 'Triage' },
			view: { type: 'root' },
		});
	}, [setPageContext]);

	// Fetch initial thread snapshot on mount to generate card structure
	useEffect(() => {
		getDBQuery(getDatabase())
			.toArray()
			.then((threads) => {
				const clientThreads = threads.map((item) => new ClientThread(item.data));
				const cardStructure = getHighlights(clientThreads);
				setInitialCards(cardStructure);
				setIsInitialLoading(false);
			})
			.catch((error) => {
				console.error('Failed to load initial cards:', error);
				setIsInitialLoading(false);
			});
	}, []);

	if (isInitialLoading) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<div className="text-neutral-500">Loading...</div>
			</div>
		);
	}

	return <TriagePageController cards={initialCards || []} />;
}

function TriagePageController({ cards }: { cards: CardData[] }) {
	const [currentCardIndex, setCurrentCardIndex] = useState(0);
	const [isNextCardReady, setIsNextCardReady] = useState(true);
	const [highlightsCache, setHighlightsCache] = useState<Map<string, string[]>>(new Map());
	const [loadingHighlights, setLoadingHighlights] = useState<Set<string>>(new Set());

	const currentCard = cards[currentCardIndex];
	const queryDeps = JSON.stringify(currentCard?.threads.map((t) => t.id) ?? []);
	const [threadsData] = useQuery(
		(db) => threadsQuery(db, currentCard?.threads.map((t) => t.id) ?? []).toArray(),
		[queryDeps],
	);
	const threadIds = threadsData?.map((t) => t.data.id) ?? [];

	// biome-ignore lint/correctness/useExhaustiveDependencies: threadIds updates on ever render
	const threads = useMemo(() => {
		return threadsData
			?.sort((a, b) => new Date(b.data.lastSentAt).getTime() - new Date(a.data.lastSentAt).getTime())
			.filter((t) => t.view === 'triage')
			.map((t) => new ClientThread(t.data))
			.filter((t) => !t.onlyHasDrafts());
	}, [threadIds.join(',')]);

	// Ensure Esc on thread detail returns to TriageInbox when coming from Flow
	const { setNavigationHistory } = useCommandPaletteActions();

	// biome-ignore lint/correctness/useExhaustiveDependencies: threadsIds updates on ever render
	useEffect(() => {
		if (!threadIds) return;
		setNavigationHistory({
			to: '/triage',
			ids: threadIds,
		});
	}, [threadIds.join(','), setNavigationHistory]);

	// Preload highlights for current and next 5 cards
	useEffect(() => {
		const preloadHighlights = async () => {
			const cardsToPreload = cards.slice(currentCardIndex, currentCardIndex + 6);

			for (const card of cardsToPreload) {
				const cacheKey = card.timestamp.getTime().toString();

				// Skip if already cached or currently loading
				if (highlightsCache.has(cacheKey) || loadingHighlights.has(cacheKey)) {
					continue;
				}

				// Mark as loading
				setLoadingHighlights((prev) => new Set(prev).add(cacheKey));

				try {
					const result = await getSummary(card);
					setHighlightsCache((prev) => new Map(prev).set(cacheKey, result.highlights.slice(0, 3)));
				} catch (error) {
					console.error('Failed to preload highlights for card:', cacheKey, error);
					setHighlightsCache((prev) => new Map(prev).set(cacheKey, []));
				} finally {
					setLoadingHighlights((prev) => {
						const newSet = new Set(prev);
						newSet.delete(cacheKey);
						return newSet;
					});
				}
			}
		};

		if (cards.length > 0) {
			preloadHighlights();
		}
	}, [currentCardIndex, cards, highlightsCache, loadingHighlights]);

	useEffect(() => {
		if (!currentCard || !threads) {
			return;
		}
		if (threads.length === 0 && isNextCardReady) {
			setCurrentCardIndex((prev) => prev + 1);
			setIsNextCardReady(false);
		}
		if (threads.length > 0) {
			setIsNextCardReady(true);
		}
	}, [currentCard, threads, isNextCardReady]);

	useDocumentEventListener('keydown', (e) => {
		if (isInputField(e)) {
			return;
		}
		if (e.key === 'ArrowRight') {
			setCurrentCardIndex((prev) => prev + 1);
		}
		if (e.key === 'ArrowLeft') {
			setCurrentCardIndex((prev) => prev - 1);
		}
	});

	if (!currentCard) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<div className="text-neutral-500">No threads to resolve.</div>
			</div>
		);
	}

	if (!threads) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<div className="text-neutral-500">Loading...</div>
			</div>
		);
	}

	// At this point, currentCard is guaranteed to be defined
	const currentHighlights = highlightsCache.get(currentCard.timestamp.getTime().toString());
	const isLoadingCurrentHighlights = loadingHighlights.has(
		currentCard.timestamp.getTime().toString(),
	);

	if (currentCard.type === 'sender' && currentCard.threads.length === 1 && threads[0]) {
		return (
			<TriageSingleViewer
				key={threads[0].id}
				card={currentCard}
				thread={threads[0]}
				highlights={currentHighlights}
				isLoadingHighlights={isLoadingCurrentHighlights}
			/>
		);
	}

	return (
		<TriageBundleViewer
			card={currentCard}
			threads={threads}
			highlights={currentHighlights}
			isLoadingHighlights={isLoadingCurrentHighlights}
		/>
	);
}

function TriageSingleViewer({
	card,
	thread,
	highlights,
	isLoadingHighlights,
}: {
	card: CardData;
	thread: ClientThread;
	highlights?: string[];
	isLoadingHighlights: boolean;
}) {
	const { setPageContext } = useCommandPaletteActions();
	const filtered = [...thread.messages.filter((m) => !m.draftId && !m.deletedAt)];
	const linkRef = useRef<HTMLAnchorElement>(null);
	const firstOpenedIndex = getFirstOpenedMessageIndex(filtered);

	useEffect(() => {
		setPageContext({
			title: { text: 'Triage' },
			view: { type: 'thread', ids: [thread.id] },
		});
	}, [setPageContext, thread]);

	// Handle command+A to select/focus the thread preview
	useDocumentEventListener('keydown', (event) => {
		// Don't handle if an input field is focused
		if (isInputField(event)) {
			return;
		}

		// Handle Command+A to select/focus the thread preview Link
		if (isKeyEventMatch(event, { key: 'a', modifiers: ['CommandOrControl'] })) {
			event.preventDefault();
			event.stopPropagation();
			linkRef.current?.focus();
			return;
		}

		// Handle Escape to remove focus from the thread preview Link
		if (event.key === 'Escape' && document.activeElement === linkRef.current) {
			event.preventDefault();
			event.stopPropagation();
			linkRef.current?.blur();
			return;
		}
	});

	return (
		<div className="flex h-full flex-col items-center justify-center px-4 sm:px-6">
			<div className="grid w-full max-w-[1080px] grid-cols-[360px_1fr] gap-8 pb-10">
				{/* Left column - sidebar */}
				<TriageSidebar
					card={card}
					highlights={highlights}
					isLoadingHighlights={isLoadingHighlights}
				/>
				{/* Right column - main content with sticky quick reply */}
				<div
					className={cn(
						'group relative flex h-[70vh] flex-col overflow-hidden rounded-md bg-white shadow-lg outline outline-1 outline-black/10',
						'transition-all duration-300 ease-in focus-within:outline focus-within:outline-blue-500/75 hover:outline hover:outline-blue-500/75',
					)}
				>
					<div className="no-scrollbar flex-1 overflow-hidden" inert>
						{filtered.map((message, i) => (
							<div
								key={message.id}
								className={cn(
									'border-b border-[#F0F0F0]',
									i === filtered.length - 1 && 'border-b-0 pb-[10vh]',
								)}
							>
								<MessageCard
									ref={undefined}
									message={new ClientMessage(thread, message)}
									defaultOpen={i >= firstOpenedIndex}
									disableClose={true}
									onExpand={() => null}
									isEmbedded={true}
									isFirst={i === 0}
								/>
							</div>
						))}
						<div className="h-8" />
					</div>
					<Link
						ref={linkRef}
						to={`/threads/${thread.id}`}
						className="absolute bottom-0 left-0 right-0 top-0 flex items-end justify-center bg-gradient-to-b from-blue-300/10 to-blue-300/25 opacity-0 transition-opacity duration-300 ease-in focus:opacity-100 group-hover:opacity-100"
					>
						<Button className="h-9 w-full min-w-64 items-center justify-between rounded-t-none bg-blue-500 text-white shadow-md outline-0 transition-none hover:bg-blue-600">
							View Full Thread
							<RiArrowRightLine className="size-4" />
						</Button>
					</Link>
				</div>
			</div>
		</div>
	);
}

function TriageBundleViewer({
	card,
	threads,
	highlights,
	isLoadingHighlights,
}: {
	card: CardData;
	threads: ClientThread[];
	highlights?: string[];
	isLoadingHighlights: boolean;
}) {
	const { isOpen: isCommandPaletteOpen } = useCommandPalette();
	const { setPageContext } = useCommandPaletteActions();
	const ref = useRef<VirtuosoHandle | null>(null);
	const data = useMemo(() => {
		return threads.map(
			(thread) =>
				({
					id: thread.id,
					key: `THREAD:${thread.id}`,
					type: 'thread',
					thread,
				}) as ThreadRowItem,
		);
	}, [threads]);

	// TODO: call setSelectedItems from the table list
	const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

	useEffect(() => {
		console.log('Setting page context: selectedItemIds', selectedItemIds);
		setPageContext({
			title: { text: 'Triage' },
			view:
				selectedItemIds.length === 0 ? { type: 'root' } : { type: 'thread', ids: selectedItemIds },
		});
	}, [setPageContext, selectedItemIds]);

	return (
		<div className="flex h-full w-full flex-col items-center justify-center px-4 sm:px-6">
			<div className="grid w-full max-w-[1080px] grid-cols-[360px_1fr] gap-8 pb-10">
				{/* Left column - sidebar */}
				<TriageSidebar
					card={card}
					highlights={highlights}
					isLoadingHighlights={isLoadingHighlights}
				/>
				{/* Right column - main content */}
				<div className="h-[70vh] rounded bg-white shadow-lg outline outline-1 outline-black/10">
					<ThreadEmbedList
						id={`inbox`}
						ref={ref}
						autoFocus={true}
						condensed={false}
						data={data}
						isActive={() => !isCommandPaletteOpen}
						onCheckedItemsChange={(ids) => {
							console.log('Checked items changed:', ids);
						}}
						onHighlightedItemChange={(item) => {
							console.log('Highlighted item changed:', item?.thread?.subject || null);
						}}
						onSelectedItemChange={(ids) => {
							console.log('Selected items changed:', ids);
							setSelectedItemIds(ids);
						}}
						// header={() => <div className="h-1" />}
						// footer={() => <div className="h-1" />}
					/>
				</div>
			</div>
		</div>
	);
}

function TriageSidebar({
	card,
	highlights,
	isLoadingHighlights,
}: {
	card: CardData;
	highlights?: string[];
	isLoadingHighlights: boolean;
}) {
	const { currentContext } = useCommandPalette();
	const category = 'appId' in card && getCategoryClientModule(card.appId);

	return (
		<div className="flex h-[70vh] flex-col justify-start gap-2 overflow-hidden">
			<div className="flex items-center gap-2 text-[28px] font-bold leading-tight">
				{category && (
					<span className="flex size-7 items-center justify-center rounded bg-blue-500">
						<category.icon className="flex-inline size-[18px] text-white" />
					</span>
				)}
				<span className="line-clamp-3 text-ellipsis">{card.title}</span>
			</div>
			<div className="flex flex-col gap-2 overflow-auto text-neutral-500">
				{(() => {
					if (isLoadingHighlights || highlights === undefined) {
						return 'Generating highlights...';
					}
					if (highlights.length === 0) {
						return 'No highlights available.';
					}
					return highlights.map((h) => (
						<div key={h} className="">
							<ImportantIcon className="mr-1 inline size-4 leading-4 text-orange-400" />
							{h}
						</div>
					));
				})()}
			</div>
			<div className="h-1 border-b" />
			<div className="-mx-2 flex flex-col gap-0.5">
				<div className="p-2 pt-4 text-xs font-medium text-neutral-500">Recommended Actions</div>
				<div className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-neutral-700">
					<RiCheckDoubleLine className="size-5" />
					Resolve
					<div className="flex-1" />
					<KeyboardShortcutBadge shortcut={{ key: 'E' }} />
				</div>
				<div className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-neutral-700">
					<RiInbox2Fill className="mx-0.5 size-4" />
					<span>
						Move to <span className="font-medium text-neutral-900">Priority</span>
					</span>
					<div className="flex-1" />
					<KeyboardShortcutBadge shortcut={{ key: 'R' }} />
				</div>
				<div className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-neutral-700">
					<RiArrowRightLine className="mx-0.5 size-4" />
					Move to...
					<div className="flex-1" />
					<KeyboardShortcutBadge shortcut={{ key: 'R', modifiers: ['Shift'] }} />
				</div>
				<div className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-neutral-700">
					<RiMoreFill className="size-5" />
					More
					<div className="flex-1" />
					<KeyboardShortcutBadge shortcut={{ key: 'K', modifiers: ['CommandOrControl'] }} />
				</div>
			</div>
		</div>
	);
}
