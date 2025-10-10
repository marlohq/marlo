import { type UIMessage, useChat } from '@ai-sdk/react';
import LRU from '@alloc/quick-lru';
import { safe } from '@orpc/client';
import {
	RiArrowDownSLine,
	RiArrowRightUpLine,
	RiArrowUpSLine,
	RiHistoryLine,
	RiLinkM,
	RiListRadio,
	RiSearchLine,
	RiThumbDownFill,
	RiThumbDownLine,
	RiThumbUpFill,
	RiThumbUpLine,
} from '@remixicon/react';
import { prependBackendUrl } from '@workspace/core/url.ts';
import { createId } from '@workspace/core/util.js';
import { getDatabase } from '@workspace/local/database.js';
import { mutate } from '@workspace/local/mutate.js';
import { useQuery } from '@workspace/local/query.js';
import type { ContactData } from '@workspace/sync-data/data.js';
import { Avatar, AvatarFallback, Button, getAvatarInitialsFallback } from '@workspace/ui';
import { Response } from '@workspace/ui/ai';
import { DefaultChatTransport } from 'ai';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { VirtuosoHandle } from 'react-virtuoso';
import { useLocalStorage } from 'usehooks-ts';
import { GenericAutocomplete } from '../components/Autocomplete.tsx';
import { useChatDrawerActions } from '../components/ChatDrawer/context.tsx';
import {
	useCommandPalette,
	useCommandPaletteActions,
} from '../components/CommandPalette/context.tsx';
import { LoadingSpinner } from '../components/LoadingSpinner.tsx';
import type { ThreadRowItem } from '../components/ThreadEmbedList.tsx';
import { ThreadEmbedList } from '../components/ThreadEmbedList.tsx';
import { ThreadTableList } from '../components/ThreadTableList.tsx';
import { useCurrentAccount } from '../hooks/useCurrentAccount.tsx';
import { useInfiniteQuery } from '../hooks/useInfiniteQuery.ts';
import { actions } from '../lib/actions.ts';
import { convertAIMessageToChatMessage } from '../lib/chat.ts';
import {
	contactAutocompleteQuery,
	getAllMailQuery,
	getAllRemindersQuery,
	getDraftsQuery,
	threadsRemoteIdsQuery,
} from '../lib/queries.ts';
import { cn, VIEWS } from '../lib/util.ts';
import { ClientThread } from '../threads/model.ts';

const db = getDatabase();

function getQueryFromSearchParams(searchParams: URLSearchParams) {
	let q = searchParams.get('q') ?? '';
	if (searchParams.get('attachments') !== null) {
		q += ` has:attachment`;
	}
	if (searchParams.get('trash') !== null) {
		q += ` in:trash`;
	}
	if (searchParams.get('spam') !== null) {
		q += ` in:spam`;
	}
	if (searchParams.get('unread') !== null) {
		q += ` is:unread`;
	}
	return q;
}

function SearchInputBar({ defaultValue }: { defaultValue: string }) {
	// Local input state for search bar
	const ref = useRef<HTMLInputElement>(null);
	const [recentSearches, setRecentSearches] = useLocalStorage<string[]>('search:recent', []);
	const [inputValue, setInputValue] = useState<string>(defaultValue);
	const [contacts] = useQuery((db) => contactAutocompleteQuery(db, inputValue, []), [inputValue]);
	const navigate = useNavigate();

	useEffect(() => {
		if (ref.current) {
			ref.current.focus();
		}
	}, []);

	function addSearchToHistory(term: string) {
		const t = term.trim();
		if (!t) return;
		setRecentSearches((prev) => [t, ...prev.filter((s) => s !== t)].slice(0, 25));
	}

	type SearchItem =
		| { type: 'search'; value: string }
		| { type: 'recent'; term: string; value: string }
		| { type: 'contact'; contact: ContactData; value: string };

	function normalize(str: string): string {
		return str.toLowerCase().replace(/[^a-z0-9]/gi, '');
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only on these deps
	const items: SearchItem[] = useMemo(() => {
		const recentItems: SearchItem[] = recentSearches
			.filter((term) => term !== inputValue && normalize(term).includes(normalize(inputValue)))
			.map((term) => ({ type: 'recent', term, value: term }));
		const contactItems: SearchItem[] = (contacts || []).map((c) => ({
			type: 'contact',
			contact: c.data,
			value: c.data.email,
		}));
		const filtered = inputValue.length === 0 ? recentItems : [...recentItems, ...contactItems];
		return [{ type: 'search' as const, value: inputValue }, ...filtered].slice(0, 5);
	}, [contacts, inputValue, recentSearches]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only on navigate
	const handleSelect = useCallback(
		(value: string) => {
			const term = decodeURIComponent(value).trim();
			setInputValue(term);
			if (term) {
				addSearchToHistory(term);
				navigate(`/search?q=${encodeURIComponent(term)}`);
			} else {
				navigate('/search');
			}
		},
		[navigate],
	);

	return (
		<div className="mb-1 flex flex-col">
			<div className="relative h-12 w-full overflow-hidden border-b bg-white">
				<div
					className={cn(
						'absolute left-2 top-1/2 flex w-8 -translate-y-1/2 items-center justify-center',
					)}
				>
					<RiSearchLine className="size-4 text-neutral-500" aria-hidden />
				</div>
				<div className={cn('group relative h-12 w-full hover:text-neutral-900')}>
					<GenericAutocomplete
						ref={ref}
						items={items}
						className="h-full w-full border-none bg-transparent px-4 pl-10 text-neutral-700 outline-none placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-0"
						autoSelectFirstItem={false}
						onSelect={handleSelect}
						inputProps={{ placeholder: 'Search' }}
						getItemKey={(item) =>
							item.type === 'recent'
								? `recent:${item.term}`
								: item.type === 'search'
									? `search:${item.value}`
									: `contact:${item.contact.email}`
						}
						getItemValue={(item) => item.value}
						searchValue={inputValue}
						setSearchValue={setInputValue}
						placeholder="Search"
						renderItem={(item) => {
							if (item.type === 'contact') {
								const contact = item.contact;
								return (
									<>
										<Avatar className="size-5">
											<AvatarFallback>
												{getAvatarInitialsFallback(contact?.name ?? contact?.email ?? '')}
											</AvatarFallback>
										</Avatar>
										<span className="max-w-[50vw] truncate">
											{contact.name && <span className="mr-1 font-semibold">{contact.name}</span>}
											{contact.email}
										</span>
									</>
								);
							}
							if (item.type === 'recent') {
								return (
									<>
										<RiHistoryLine className="size-4 text-neutral-500" aria-hidden />
										<span className="max-w-[50vw] truncate">{item.term}</span>
									</>
								);
							}
							if (item.type === 'search') {
								return (
									<>
										<RiSearchLine className="size-4 text-neutral-500" aria-hidden />
										<span className="max-w-[50vw] truncate">{item.value}</span>
									</>
								);
							}
						}}
					/>
				</div>
			</div>
		</div>
	);
}

export function Component() {
	const { isOpen } = useCommandPalette();
	const { setPageContext, setNavigationHistory } = useCommandPaletteActions();
	const [searchParams] = useSearchParams();
	const searchQuery = searchParams.get('q') ?? '';
	const q = getQueryFromSearchParams(searchParams);
	const searchValue = q;
	const [results, setResults] = useState<ClientThread[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [searchToken, setSearchToken] = useState<string | undefined | null>(null);
	const [searchType, setSearchType] = useState<'AI' | 'BASIC' | null>(null);
	const ref = useRef<VirtuosoHandle>(null);
	const fetchMoreResults = useCallback(async (searchValue: string, searchToken: string) => {
		setIsLoading(true);
		const { nextPageToken, results } = await actions.google.search({
			query: searchValue,
			token: searchToken ?? undefined,
		});
		const data = await threadsRemoteIdsQuery(db, results).toArray();
		const threads = data.map((thread) => new ClientThread(thread.data));
		setResults((prev) => [...prev, ...threads]);
		setSearchToken(nextPageToken);
		setIsLoading(false);
	}, []);

	const fetchInitialResults = useCallback(async (searchValue: string) => {
		setResults([]);
		setSearchToken(null);
		setIsLoading(true);
		setSearchType(null);
		const enableAiSearchPrecheck = classifySearchType(searchValue);
		const enableAiSearchPromise = enableAiSearchPrecheck
			? Promise.resolve(enableAiSearchPrecheck)
			: safe(actions.inbox.analyzeQuery({ q: searchValue })).then((r) => r.data?.result);
		const { nextPageToken, results } = await actions.google.search({
			query: searchValue,
			token: undefined,
		});
		const data = await threadsRemoteIdsQuery(db, results).toArray();
		const threads = data.map((thread) => new ClientThread(thread.data));
		const enableAiSearch = threads.length === 0 || (await enableAiSearchPromise) === 'AI';
		setResults(threads);
		setSearchType(enableAiSearch ? 'AI' : 'BASIC');
		setIsLoading(false);
		if (threads.length === 0) {
			setSearchToken(undefined);
		} else {
			setSearchToken(nextPageToken);
		}
	}, []);

	useEffect(() => {
		if (q) {
			setPageContext({
				title: { text: `Search results for "${q}"` },
				view: { type: 'root' },
			});
		} else {
			setPageContext({
				title: { text: 'Search' },
				view: { type: 'root' },
			});
		}
	}, [q, setPageContext]);

	// Track navigation for search results
	useEffect(() => {
		setNavigationHistory({
			to: searchQuery ? `/search?q=${encodeURIComponent(searchQuery)}` : '/search',
			ids: results.map((t) => t.id),
		});
	}, [searchQuery, results, setNavigationHistory]);

	useEffect(() => {
		fetchInitialResults(searchValue);
		ref.current?.scrollToIndex(0);
	}, [searchValue, fetchInitialResults]);

	if (searchQuery === '') {
		return (
			<Fragment key={searchQuery}>
				<SearchInputBar defaultValue={searchQuery} />
			</Fragment>
		);
	}

	const specialView = searchQuery
		? VIEWS.find((v) => searchQuery.includes(v.id) && v.special)
		: VIEWS[0];
	if (specialView) {
		return (
			<Fragment key={searchQuery}>
				<SearchInputBar defaultValue={searchQuery} />
				<AllThreadsView view={specialView} />
			</Fragment>
		);
	}

	if (isLoading && results.length === 0) {
		return (
			<Fragment key={searchQuery}>
				<SearchInputBar defaultValue={searchQuery} />
				<div className="mx-auto flex h-full w-full max-w-xl flex-col items-center justify-center gap-1 text-center">
					<LoadingSpinner />
				</div>
			</Fragment>
		);
	}

	return (
		<div key={searchQuery} className="mx-auto flex h-full w-full flex-col">
			<SearchInputBar defaultValue={searchQuery} />
			{searchType === 'AI' && (
				<div className="flex flex-col px-6 py-2">
					<AiSummaryCard
						autoExpand={results.length === 0}
						query={searchQuery}
						cacheKey={`${searchQuery}:${String(results[0]?.id)}`}
					/>
				</div>
			)}
			{results.length === 0 && (
				<div className="flex flex-col px-4 pb-1 sm:px-10">
					<div className="text-neutral-600">
						<span className="">{`No results for `}</span>
						<span className="italic">{`"${searchQuery}"`}</span>
					</div>
				</div>
			)}
			{results.length > 0 && (
				<ThreadTableList
					id={`search:${searchQuery}`}
					ref={ref}
					island={true}
					autoFocus={true}
					isActive={() => !isOpen}
					data={
						results.length > 0
							? results.map((t) => ({
									id: t.id,
									type: 'thread' as const,
									thread: t,
								}))
							: []
					}
					onEndReached={() => {
						if (!searchValue || !searchToken || isLoading) {
							return;
						}
						fetchMoreResults(searchValue, searchToken);
					}}
				/>
			)}
		</div>
	);
}

function AllThreadsView({ view }: { view: (typeof VIEWS)[number] }) {
	const { isOpen } = useCommandPalette();
	const { setNavigationHistory } = useCommandPaletteActions();
	const ref = useRef<VirtuosoHandle>(null);
	const { rows, onEndReached, info } = useInfiniteQuery(
		(db) => {
			if (view.name === 'Reminders') {
				return getAllRemindersQuery(db);
			}
			if (view.name === 'Drafts') {
				return getDraftsQuery(db);
			}
			return getAllMailQuery(db);
		},
		[view],
	);
	const threads = rows?.map((r) => new ClientThread(r.data)) ?? [];
	const isEmpty = threads.length === 0 && info.status === 'complete';

	// Track navigation for special search views
	useEffect(() => {
		setNavigationHistory({
			to: '/search',
			ids: threads.map((t) => t.id),
		});
	}, [threads, setNavigationHistory]);

	if (isEmpty) {
		return (
			<div className="flex h-full w-full items-center justify-center text-neutral-500">
				<div className="flex items-center gap-1">
					<RiListRadio className="size-4 text-neutral-900" />
					<span className="font-medium text-neutral-900">{view.name}</span>
					<span>is empty.</span>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto flex h-full w-full flex-col py-1">
			<ThreadTableList
				id={`search:all`}
				ref={ref}
				island={true}
				autoFocus={true}
				isActive={() => !isOpen}
				data={[
					{
						id: 'inbox',
						type: 'header' as const,
						title: view.name,
					},
					...threads.map((t) => ({
						id: t.id,
						type: 'thread' as const,
						thread: t,
					})),
				]}
				onEndReached={onEndReached}
			/>
		</div>
	);
}

/**
 * Cache AI responses to prevent slow re-rendering of recent requests. We use a simple LRU here to
 * manage max-age and max-size of the cache.
 *
 * It is acceptable that this is in memory. The cache will be cleared when the page is refreshed.
 */
const aiSummaryResponseCache = new LRU<string, UIMessage>({ maxSize: 100, maxAge: 1000 * 60 * 15 });

function getMessageText(message: UIMessage): string {
	return message.parts
		.filter((part) => part.type === 'text')
		.map((part) => part.text)
		.join('');
}

function AiSummaryCard({
	query,
	autoExpand,
	cacheKey,
}: {
	query: string;
	autoExpand: boolean;
	cacheKey: string;
}) {
	const summaryRef = useRef<HTMLDivElement>(null);
	const [isShowMore, setIsShowMore] = useState(false);
	const [isShowMoreVisible, setIsShowMoreVisible] = useState(false);
	const [voteValue, setVoteValue] = useState<'up' | 'down' | null>(null);
	const navigate = useNavigate();
	const currentAccount = useCurrentAccount();
	const { open: openChatDrawer } = useChatDrawerActions();

	const initialMessage: UIMessage = {
		id: createId(),
		role: 'user',
		parts: [{ type: 'text', text: query }],
	};
	const cachedResponse = aiSummaryResponseCache.get(cacheKey);
	const { messages, regenerate, status } = useChat({
		transport: new DefaultChatTransport({ api: prependBackendUrl('/api/prompt/search') }),
		messages: cachedResponse ? [initialMessage, cachedResponse] : [initialMessage],
		onFinish({ message }) {
			aiSummaryResponseCache.set(query, message);
		},
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally on mount.
	useEffect(() => {
		if (cachedResponse) {
			return;
		}
		regenerate();
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally not exhaustive.
	useEffect(() => {
		if (!summaryRef.current || isShowMoreVisible || status !== 'ready') {
			return;
		}
		setIsShowMoreVisible(isEllipsisActive(summaryRef.current));
	}, [status]);

	const relevantMessages = messages.filter((m) => m.role === 'assistant');
	const hasTextReady = relevantMessages.some((m) => m.parts.some((p) => p.type === 'text'));
	const relevantCorroborations = relevantMessages
		.flatMap((m) => {
			const citationRegex = /!\[(\w+)\]\((\w+)\)/g;
			const messageText = getMessageText(m);
			if (!messageText) return [];
			const matches = Array.from(messageText.matchAll(citationRegex));
			return matches.map((match) => match[2]);
		})
		.filter(Boolean);

	return (
		<div className={cn('mb-2 flex w-full max-w-screen-xl gap-4 border-b pb-4 pt-1')}>
			<div
				className={cn(
					'flex h-auto min-h-[194px] w-full flex-col gap-2 rounded-md bg-neutral-100 px-4 pb-3 pt-3',
				)}
			>
				<div className="inline-flex items-center gap-2 text-neutral-800">
					<div className="text-base font-medium">
						{hasTextReady ? 'AI Summary' : status === 'streaming' ? 'Generating...' : 'Thinking...'}
					</div>
				</div>
				<div
					className={cn(
						'line-clamp-4 h-full text-base leading-normal text-neutral-800',
						(isShowMore || autoExpand) && 'line-clamp-none',
					)}
					ref={summaryRef}
				>
					{!hasTextReady && (status === 'streaming' || status === 'submitted') && (
						<>
							<div className="mb-2 h-4 w-full animate-pulse rounded bg-neutral-300"></div>
							<div className="mb-2 h-4 w-[92%] animate-pulse rounded bg-neutral-300"></div>
							<div className="mb-2 h-4 w-[78%] animate-pulse rounded bg-neutral-300"></div>
						</>
					)}
					{relevantMessages.map((m) =>
						m.parts.map((part, index) =>
							part.type === 'text' ? <Response key={index}>{part.text}</Response> : null,
						),
					)}
				</div>
				<div
					className={cn(
						'flex items-center justify-between gap-2 opacity-0 transition-opacity duration-300 ease-in-out',
						status === 'ready' && relevantMessages.length > 0 && 'opacity-100',
					)}
				>
					<div className="flex flex-wrap gap-2">
						{isShowMoreVisible && !isShowMore && (
							<Button type="button" size="sm" onClick={() => setIsShowMore((prev) => !prev)}>
								<span>{`Show more`}</span>
								<RiArrowDownSLine className="size-4 shrink-0" />
							</Button>
						)}
						{isShowMore && (
							<Button type="button" size="sm" onClick={() => setIsShowMore(false)}>
								<span>{`Show less`}</span>
								<RiArrowUpSLine className="size-4 shrink-0" />
							</Button>
						)}
						<Button
							type="button"
							size="sm"
							onClick={() => {
								const id = createId();
								const now = new Date().toISOString();
								mutate.conversations.create({
									id,
									accountId: currentAccount.id,
									threadId: null,
									updatedAt: now,
									createdAt: now,
									title: query,
									chatMessages: messages.map((m) => convertAIMessageToChatMessage(m, id)),
								});
								openChatDrawer(id);
							}}
						>
							<span>{`Open in chat`}</span>
							<RiArrowRightUpLine className="size-4 shrink-0" />
						</Button>
					</div>
					<div className="flex text-neutral-600">
						<Button
							variant="ghost"
							size="icon"
							className={cn(
								'size-7 transition-none',
								voteValue === 'up' && 'bg-neutral-200 text-neutral-700',
							)}
							onClick={() => setVoteValue((prev) => (prev === 'up' ? null : 'up'))}
						>
							{voteValue === 'up' ? (
								<RiThumbUpFill className="size-4 shrink-0" />
							) : (
								<RiThumbUpLine className="size-4 shrink-0" />
							)}
						</Button>
						<Button
							variant="ghost"
							size="icon"
							className={cn(
								'size-7 transition-none',
								voteValue === 'down' && 'bg-neutral-200 text-neutral-700',
							)}
							onClick={() => setVoteValue((prev) => (prev === 'down' ? null : 'down'))}
						>
							{voteValue === 'down' ? (
								<RiThumbDownFill className="size-4 shrink-0" />
							) : (
								<RiThumbDownLine className="size-4 shrink-0" />
							)}
						</Button>
					</div>
				</div>
			</div>
			<div
				className={cn(
					'flex w-full shrink-0 flex-col opacity-0 transition-opacity md:flex md:w-[320px] lg:w-[420px] xl:w-[480px]',
					relevantCorroborations.length > 0 && 'opacity-100',
				)}
			>
				<SearchCorroborationCard threadIds={relevantCorroborations} />
			</div>
		</div>
	);
}

function SearchCorroborationCard({ threadIds }: { threadIds: string[] }) {
	const [threadData] = useQuery(
		(db) => db.threads.where('data.id').anyOf(threadIds).toArray(),
		[threadIds],
	);
	const threads = threadData?.map((t) => new ClientThread(t.data)) ?? [];
	const ref = useRef<VirtuosoHandle | null>(null);
	const items: ThreadRowItem[] = threads.map((t) => ({
		id: t.id,
		key: `THREAD:${t.id}`,
		type: 'thread',
		thread: t,
	}));

	return (
		<div
			className="w-full rounded bg-white shadow-sm outline outline-1 outline-black/10"
			style={{ height: items.length * 64, maxHeight: 3 * 64, minHeight: 64 }}
		>
			<ThreadEmbedList
				id={`search-corroboration`}
				ref={ref}
				data={items}
				autoFocus={false}
				condensed={true}
				isActive={() => false}
			/>
		</div>
	);
}

function ExternalAnchorTag(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
	return <a {...props} target="_blank" rel="noreferrer" />;
}

// TODO: We currently only show the first citation if multiple are present together (using CSS via the "ai-citation" class).
// In the future, we should be able to show all of them.
function CitationTag(props: React.ImgHTMLAttributes<HTMLImageElement>) {
	const threadId = props.src;
	return (
		<Link
			to={`/threads/${threadId}`}
			className="ai-citation mx-0.5 size-[22px] shrink-0 items-center justify-center rounded-full bg-neutral-200 text-neutral-600"
		>
			<RiLinkM className="inline size-4 shrink-0" />
		</Link>
	);
}

function isEllipsisActive(e: HTMLElement) {
	const temp = e.cloneNode(true) as HTMLElement;
	temp.classList.remove('line-clamp-4');
	e.parentElement?.appendChild(temp);
	try {
		const fullHeight = temp.getBoundingClientRect().height;
		const displayHeight = e.getBoundingClientRect().height;
		return fullHeight > displayHeight;
	} finally {
		temp.remove();
	}
}

const GOOGLE_SEARCH_OPERATORS_REGEX =
	/\b(from|to|cc|bcc|subject|older_than|newer_than|site|in|is|has|label|category|list|filetype|before|after|older|newer|rfc822msgid|size|larger|smaller|deliveredto):/i;
const TEMPORAL_SEARCH_REGEX =
	/\b(yesterday|today|tomorrow|last|this|next|before|after|between|since|until|q[1-4]\b|jan[uary]?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t|tember)?|oct(ober)?|nov(ember)?|dec(ember)?|20[0-9]{2})\b/i;
const SUPERLATIV_SEARCH_REGEX =
	/\b(latest|newest|earliest|first|last|most|top|biggest|smallest|highest|lowest)\b/i;
const TASK_SEARCH_REGEX =
	/\b(summarize|summary|extract|list|compile|count|compare|find|show|what|which|who|when|where)\b/i;
const WHITESPACE_REGEX = /\s/;

function classifySearchType(query: string): 'AI' | 'BASIC' | undefined {
	const q = (query || '').trim().toLowerCase();
	if (!q) return 'BASIC';
	if (!WHITESPACE_REGEX.test(q)) return 'BASIC';
	if (GOOGLE_SEARCH_OPERATORS_REGEX.test(q)) return 'BASIC';
	if (TEMPORAL_SEARCH_REGEX.test(q)) return 'AI';
	if (SUPERLATIV_SEARCH_REGEX.test(q)) return 'AI';
	if (TASK_SEARCH_REGEX.test(q)) return 'AI';
	return undefined;
}
