import { safe } from '@orpc/client';
import {
	RiAlarmFill,
	RiAlarmLine,
	RiCheckDoubleFill,
	RiMoreFill,
	RiShieldFill,
	RiSpam2Fill,
} from '@remixicon/react';
import { createId } from '@workspace/core/util.js';
import { mutate } from '@workspace/local/mutate.js';
import { useQuery } from '@workspace/local/query.ts';
import type { ChatConversationData, SpaceData } from '@workspace/sync-data/data.js';
import { Button } from '@workspace/ui';
import { invariant, memoize } from 'es-toolkit';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import moveToPriorityCommand from '../commands/commands/moveToPriority.ts';
import remindCommand from '../commands/commands/remind.ts';
import resolveCommand from '../commands/commands/resolve.ts';
import { ChatInput } from '../components/Chat/ChatInput.tsx';
import { useChatDrawerActions } from '../components/ChatDrawer/context.tsx';
import {
	useCommandPalette,
	useCommandPaletteActions,
} from '../components/CommandPalette/context.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { LoadingSpinner } from '../components/LoadingSpinner.tsx';
import { MessageCard } from '../components/ThreadDetails/MessageCard.tsx';
import { useCurrentAccount } from '../hooks/useCurrentAccount.tsx';
import { useSpaces } from '../hooks/useSpaces.tsx';
import { useThreadNavigation } from '../hooks/useThreadNavigation.ts';
//
import { ImportantIcon } from '../icons/ImportantIcon.tsx';
import { actions } from '../lib/actions.ts';
import {
	cn,
	formatTimestamp,
	getFirstOpenedMessageIndex,
	getSpaceDisplayName,
} from '../lib/util.ts';
import { ClientMessage } from '../models/message.ts';
import { ClientThread, isUnsentThread } from '../threads/model.ts';
import {
	setThreadReadStatus,
	setThreadSafeStatus,
	setThreadSpamStatus,
} from '../threads/mutations.ts';

const getHighlights = memoize(
	async (thread: ClientThread) => {
		const result = await actions.threads.getHighlights({ threadId: thread.id });
		return { highlights: result.highlights ?? [] };
	},
	{ getCacheKey: (thread) => thread.id },
);

export function Component() {
	const { threadId } = useParams() as { threadId: string };
	const { setPageContext } = useCommandPaletteActions();
	const [data, info] = useQuery(
		(db) => db.threads.where('data.id').equals(threadId).first(),
		[threadId],
	);
	const [relatedChats] = useQuery(
		(db) => db.conversations.where('data.threadId').equals(threadId).limit(3).reverse().toArray(),
		[threadId],
	);
	const unsent = data?.data ? isUnsentThread(data.data) : false;
	const hasMarkedAsRead = useRef(false);
	useThreadNavigation(data?.data || null);

	useEffect(() => {
		if (data?.data && !hasMarkedAsRead.current && !unsent) {
			setThreadReadStatus(data.data, true);
			hasMarkedAsRead.current = true;
		}
	}, [data?.data, unsent]);

	useEffect(() => {
		if (!data) {
			return;
		}
		const thread = new ClientThread(data.data);
		setPageContext({
			title: { text: thread.subject },
			view: { type: 'thread', ids: [thread.id] },
		});
	}, [data, setPageContext]);

	if (!data || (!data && info.status === 'complete')) {
		return <EmptyState message="No thread found." />;
	}
	const thread = new ClientThread(data.data);
	return <ThreadContent thread={thread} relatedChats={relatedChats?.map((c) => c.data) ?? []} />;
}

function ThreadContent({
	thread,
	relatedChats,
}: {
	thread: ClientThread;
	relatedChats: ChatConversationData[];
}) {
	const currentAccount = useCurrentAccount();
	const { setOpen } = useCommandPaletteActions();
	const { open: openChatDrawer } = useChatDrawerActions();
	const filtered = [...thread.messages.filter((m) => !m.draftId && !m.deletedAt)];
	const firstOpenedIndex = getFirstOpenedMessageIndex(filtered);
	const firstOpenWrapperRef = useRef<HTMLDivElement | null>(null);
	const scrollContainerRef = useRef<HTMLDivElement | null>(null);
	const hasInitialScroll = useRef(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: TODO
	useEffect(() => {
		if (hasInitialScroll.current) return;
		const container = scrollContainerRef.current;
		const target = firstOpenWrapperRef.current;
		// If the first opened index is 0, do not scroll (mark as handled once)
		if (firstOpenedIndex === 0) {
			hasInitialScroll.current = true;
			return;
		}
		if (!container || !target) return;
		// Perform a one-time scroll to the first opened message
		hasInitialScroll.current = true;
		const containerTop = container.getBoundingClientRect().top;
		const targetTop = target.getBoundingClientRect().top;
		const delta = targetTop - containerTop;
		if (delta > container.getBoundingClientRect().height) {
			container.scrollTop += Math.max(0, delta - 16);
		}
	}, [thread.id]);

	return (
		<div className="grid h-[calc(100vh-16px)] w-full grid-cols-1 transition-all duration-300 ease-in-out lg:grid-cols-[1fr_minmax(0,min(420px,33vw))]">
			{/* Left column - thread content */}
			<div
				id="thread-content"
				className="no-scrollbar h-full w-full overflow-y-auto border-r bg-white"
				ref={scrollContainerRef}
			>
				<div className="flex w-full flex-col items-center transition-size duration-300 ease-in-out">
					<ThreadDetailsHeader thread={thread} />
					{thread.spammedAt && <SpamBanner />}
					{filtered.map((message, i) => {
						// Get the last message if it's the only one, or if there are multiple and we've read this thread before
						const isDefaultOpen = i >= firstOpenedIndex;
						const isFirstOpen = i === firstOpenedIndex;
						return (
							<div
								key={message.id}
								className={cn(
									'flex w-full items-center justify-center overflow-hidden border-b border-[#F0F0F0]',
									filtered.length === 1 && 'mt-2',
									i === filtered.length - 1 && 'border-b-0 pb-[10vh]',
								)}
								ref={isFirstOpen ? firstOpenWrapperRef : undefined}
							>
								<MessageCard
									message={new ClientMessage(thread, message)}
									defaultOpen={isDefaultOpen}
									disableClose={isDefaultOpen}
									isLast={i === filtered.length - 1}
									isFirst={i === 0}
								/>
							</div>
						);
					})}
				</div>
			</div>
			{/* Right column - thread details */}
			<div className="hidden h-full min-h-0 w-full flex-col bg-white p-3 lg:flex">
				<div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
					<HighlightsSidebar thread={thread} />
				</div>
				<div className="shrink-0">
					<div className="-mt-6 h-8 w-full bg-gradient-to-b from-transparent to-white to-90%"></div>
					{relatedChats.length > 0 && (
						<>
							<div className="flex h-6 items-baseline justify-between gap-2 px-2">
								<span className="font-medium text-neutral-800">{'Recent Chats'}</span>
								<button
									type="button"
									className="text-xs text-neutral-600 hover:underline"
									onClick={() => setOpen({ type: 'conversation.switch' })}
								>
									{'View All'}
								</button>
							</div>
							{relatedChats.map((chat) => (
								<div
									key={chat.id}
									className="flex h-[26px] w-full min-w-0 items-center justify-between gap-2 px-2 text-left !no-underline hover:bg-transparent"
								>
									<button
										type="button"
										onClick={() => openChatDrawer(chat.id)}
										className="min-w-0 flex-1 truncate text-left text-neutral-600 hover:underline"
									>
										{chat.title}
									</button>
									<span className="shrink-0 text-sm text-neutral-400 !no-underline">
										{formatTimestamp(new Date(chat.updatedAt))}
									</span>
								</div>
							))}
							<div className="h-2" />
						</>
					)}
					<ChatInput
						onSubmit={(e) => {
							e.preventDefault();
							const form = e.currentTarget;
							const formData = new FormData(form);
							const message = formData.get('message');
							invariant(message, 'form "message" is required');
							const id = createId();
							const now = new Date().toISOString();
							mutate.conversations.create({
								id,
								accountId: currentAccount.id,
								threadId: thread.id,
								updatedAt: now,
								createdAt: now,
								title: 'New conversation',
								chatMessages: [
									{
										id: createId(),
										role: 'user',
										content: message as string,
										createdAt: now,
										conversationId: id,
									},
								],
							});
							openChatDrawer(id);
							form.reset();
						}}
					/>
				</div>
			</div>
		</div>
	);
}

// NOTE(fks): Set a "key" prop on the component to ensure it persists and animates when the visibility changes.
function HighlightsLoadingIndicator({ isVisible }: { isVisible: boolean }) {
	return (
		<div
			className={cn(
				'flex items-center gap-2 py-1.5 transition-all',
				!isVisible && 'translate-y-1 opacity-0 delay-500 duration-500',
			)}
		>
			<LoadingSpinner className="size-4 text-blue-500" />
			<div className="text-sm text-neutral-500">Marlo is thinking...</div>
		</div>
	);
}
function HighlightsSidebar({ thread }: { thread: ClientThread }) {
	const [highlights, setHighlights] = useState<string[]>([]);
	const [isLoading, setIsLoading] = useState(false);

	useEffect(() => {
		let isMounted = true;
		(async () => {
			setIsLoading(true);
			try {
				const result = await getHighlights(thread);
				if (isMounted) {
					setHighlights(result.highlights);
				}
			} finally {
				if (isMounted) setIsLoading(false);
			}
		})();
		return () => {
			isMounted = false;
		};
	}, [thread]);

	if (isLoading) {
		return (
			<div className="mb-5">
				<HighlightsLoadingIndicator key="persist-loading-indicator" isVisible={true} />
			</div>
		);
	}

	if (highlights.length === 0) {
		return (
			<div className="mb-5">
				<div className={cn('flex items-center gap-2 py-1.5')}>
					<div className="text-sm text-neutral-500">No highlights available.</div>
				</div>
			</div>
		);
	}

	return (
		<div className="mb-5">
			<div className="mb-1 flex items-center justify-between">
				<div className="font-medium text-neutral-800">{'Highlights'}</div>
				<Button size="icon" variant="ghost" className="size-6" disabled>
					<RiMoreFill className="size-4" />
				</Button>
			</div>
			{highlights.map((h) => (
				<div key={h} className="mb-1 flex">
					<ImportantIcon className="mr-1 inline size-6 shrink-0 p-0.5 pl-0 pr-1 leading-4 text-orange-400" />
					<span className="text-neutral-600">{h}</span>
				</div>
			))}
			<HighlightsLoadingIndicator key="persist-loading-indicator" isVisible={false} />
		</div>
	);
}

function ThreadDetailsHeader({ thread }: { thread: ClientThread }) {
	const { navigationHistory } = useCommandPalette();
	const spaces = useSpaces();
	const threadSpace = ((): ReturnType<typeof useSpaces>[number] | null => {
		const sid = thread.spaceId;
		if (!sid || sid.startsWith('inbox_')) {
			return null;
		}
		const space = spaces.find((s) => s.id === sid);
		if (!space) {
			return null;
		}
		return space;
	})();
	return (
		<div className="w-full border-b border-[#F0F0F0]" style={{}}>
			<div className="h-full w-full bg-gradient-to-b from-[#fcfcfc] to-red-500" />
			<div
				className={cn(
					'mx-auto flex w-full max-w-screen-md flex-col px-6',
					threadSpace ? 'pb-8 pt-12' : 'pb-8 pt-20',
				)}
			>
				<div className="flex items-center justify-between gap-4 lg:gap-12">
					<div
						className={cn(
							'line-clamp-2 w-full text-balance text-[28px] font-semibold leading-tight text-neutral-700',
							thread.subject.length > 60 && 'text-[26px] leading-7',
						)}
					>
						{thread.subject || 'No subject'}
					</div>
					<ThreadActionButtons thread={thread} />
				</div>
				{threadSpace && <ThreadSpaceDetailsBar thread={thread} space={threadSpace} />}
				<div className="mt-8">
					<ThreadSecurityWarning thread={thread} />
				</div>
			</div>
		</div>
	);
}

function ThreadSpaceDetailsBar({ thread, space }: { thread: ClientThread; space: SpaceData }) {
	return (
		<div className="flex items-center gap-1.5 px-0.5 py-2">
			<Link
				to={`/spaces/${space.id}`}
				className="text-sm font-medium text-neutral-600 hover:text-neutral-900"
			>
				{getSpaceDisplayName(space.name)}
			</Link>
			<div className="w-4" />
			{space.properties.map((property: SpaceData['properties'][number]) => {
				const value = (thread.spaceProperties || ({} as Record<string, unknown>))[property.id];
				if (value) {
					return (
						<Button key={property.id} size="sm" className="h-6 gap-1 text-sm font-normal shadow">
							<span className="opacity-60">{property.name}</span>
							<span className="opacity-50">{' • '}</span>
							<span className="">{String(value)}</span>
						</Button>
					);
				}
				return (
					<Button
						key={property.id}
						size="sm"
						variant="ghost"
						className="h-6 bg-transparent text-sm font-medium text-neutral-500"
					>
						{`Set ${property.name}`}
					</Button>
				);
			})}

			<Button asChild size="icon" variant="ghost" className="size-6">
				<Link to={`/spaces/${space.id}`}>
					<RiMoreFill className="size-4" />
				</Link>
			</Button>
		</div>
	);
}

function ThreadActionButtons({ thread }: { thread: ClientThread }) {
	const { setOpen } = useCommandPaletteActions();
	const spaces = useSpaces();
	const moveToPriorityAction = moveToPriorityCommand.useAction();
	const resolveAction = resolveCommand.useAction();
	const remindAction = remindCommand.useAction();

	const isReminder = thread.data.remindAt && !thread.data.reminderTriggeredAt;
	const isResolved = thread.resolvedAt && !isReminder;
	return (
		<div className="-mr-1.5 flex shrink-0 items-center gap-1 justify-self-end">
			<Button
				size="icon"
				variant="ghost"
				className={cn(
					'size-8 rounded-md text-neutral-500 transition-none',
					isResolved ? 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/10 hover:text-blue-500' : '',
				)}
				onClick={() => {
					if (isResolved) {
						moveToPriorityAction([thread]).run();
					} else {
						resolveAction([thread]).run();
					}
				}}
			>
				<RiCheckDoubleFill className="size-5" />
			</Button>
			{/* TODO: Need to implement "add to triage" for those who want it */}
			<Button
				size="icon"
				variant="ghost"
				className={cn(
					'size-8 rounded-md text-neutral-500 transition-none',
					isReminder ? 'bg-orange-500/10 text-orange-500 hover:text-orange-500' : '',
				)}
				onClick={() => remindAction([thread]).run()}
			>
				{isReminder ? <RiAlarmFill className="size-5" /> : <RiAlarmLine className="size-5" />}
			</Button>
			<Button
				size="icon"
				variant="ghost"
				className="size-8 rounded-md text-neutral-500 transition-none"
				onClick={() => setOpen({ type: 'thread', ids: [thread.id] })}
			>
				<RiMoreFill className="size-5" />
			</Button>
		</div>
	);
}

function SpamBanner() {
	return (
		<div className="mb-4 inline-flex h-12 w-full shrink-0 items-center justify-start gap-2 border border-red-700 bg-red-600 px-4 sm:px-4">
			<RiSpam2Fill className="size-6 text-white" aria-hidden />
			<div className="font-semibold leading-tight text-white">Danger!</div>
			<div className="leading-tight text-white">
				This thread has been labeled as spam. Be careful interacting with it.
			</div>
		</div>
	);
}

function ThreadSecurityWarning({ thread }: { thread: ClientThread }) {
	const [attackScore, setAttackScore] = useState<{
		level: string;
		score: number;
		reasoning?: string;
	} | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: toString() is intentional.
	useEffect(() => {
		// Don't assess if thread is marked safe
		if (thread.markedSafeAt) {
			return;
		}

		if (thread.spammedAt) {
			setAttackScore({
				level: 'high',
				score: 100,
				reasoning: 'This thread has been marked as spam.',
			});
			return;
		}
		setIsLoading(true);
		safe(actions.messages.audit({ threadId: thread.id })).then((result) => {
			if (result.data) {
				setAttackScore(result.data);
			}
			setIsLoading(false);
		});
	}, [thread.id, thread.spammedAt?.toString(), thread.markedSafeAt?.toString()]);

	// Don't show warning if thread is marked safe
	if (thread.markedSafeAt) {
		return null;
	}

	// Only show warning for high or medium risk threads with reasoning
	if (
		isLoading ||
		!attackScore ||
		(attackScore.level !== 'high' && attackScore.level !== 'medium') ||
		!attackScore.reasoning
	) {
		return null;
	}

	const handleMoveToSpam = () => {
		// Mark the thread as spam
		setThreadSpamStatus([thread.data], true);
	};

	const handleMarkAsSafe = () => {
		// Mark the thread as safe
		setThreadSafeStatus(thread.data, true);
	};

	return (
		<div className="w-full">
			<div className="rounded-md bg-[#F5F5F5] px-8 py-6">
				<div className="flex flex-col">
					{/* Title with Shield Icon */}
					<div className="mb-2 flex items-center gap-2">
						<RiShieldFill
							className={cn(
								'size-6',
								attackScore.level === 'high' ? 'text-red-600' : 'text-orange-600',
							)}
						/>
						<h3 className="text-lg font-semibold text-black">
							{attackScore.level === 'high' ? 'Phishing' : 'Suspicious'}
						</h3>
					</div>

					{/* Content */}
					<div className="flex-1">
						{/* Reasoning Text */}
						<p className="mb-4 text-base leading-relaxed text-neutral-600">
							{attackScore.reasoning}
						</p>

						{/* Action Buttons */}
						<div className="flex gap-2">
							<Button
								size="sm"
								onClick={handleMoveToSpam}
								className={cn(
									'px-4 text-white',
									attackScore.level === 'high'
										? 'bg-red-600 hover:bg-red-700'
										: 'bg-orange-600 hover:bg-orange-700',
								)}
							>
								Move to spam
							</Button>
							<Button
								size="sm"
								variant="outline"
								className="px-4"
								onClick={handleMarkAsSafe}
								title="Mark this thread as safe"
							>
								Mark as safe
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
