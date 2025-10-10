import {
	RiBrainLine,
	RiFileCopyLine,
	RiHammerLine,
	RiSearch2Line,
	RiThumbDownLine,
	RiThumbUpLine,
} from '@remixicon/react';
import type { UIChatMessage } from '@workspace/ai';
import { mutate } from '@workspace/local/mutate.js';
import { useQuery } from '@workspace/local/query.ts';
import type { ChatConversationData } from '@workspace/sync-data/data.js';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@workspace/ui';
import {
	Action,
	Actions,
	Conversation,
	ConversationContent,
	Message,
	MessageContent,
	MessageTimestamp,
	Response,
} from '@workspace/ui/ai';
import { invariant } from 'es-toolkit';
import { type ComponentProps, useEffect } from 'react';
import { toast } from 'sonner';
import { useConversation } from '../../hooks/chat.ts';
import { actions } from '../../lib/actions.ts';
import { cn, formatTimestamp } from '../../lib/util.ts';
import { ClientThread } from '../../threads/model.ts';
import { ChatInput } from '../Chat/ChatInput.tsx';
import { ThreadEmbedListRow } from '../ThreadEmbedList.tsx';
import { useChatDrawer, useChatDrawerActions } from './context.tsx';

export function ChatDrawer() {
	const { isOpen, conversationId } = useChatDrawer();
	const { setOpen } = useChatDrawerActions();

	return (
		<Drawer open={isOpen} onOpenChange={setOpen}>
			<DrawerContent offset="right">
				{conversationId ? (
					<ChatDrawerContentLoader id={conversationId} />
				) : (
					<DrawerHeader>
						<DrawerTitle>Chat</DrawerTitle>
					</DrawerHeader>
				)}
			</DrawerContent>
		</Drawer>
	);
}

function ChatDrawerContentLoader({ id }: { id: string }) {
	const [chatData] = useQuery(
		(db) =>
			db.conversations
				.where('data.id')
				.equals(id || '')
				.first(),
		[id],
	);
	const [threadData] = useQuery(
		(db) =>
			db.threads
				.where('data.id')
				.equals(chatData?.data?.threadId || '')
				.first(),
		[chatData?.data?.threadId || ''],
	);
	useEffect(() => {
		const firstMessage = chatData?.data?.chatMessages[0];
		// Only update the title if no title has been set yet. We'll use the first message content and
		// pass this to an LLM prompt to generate a title that best represents the conversation.
		if (
			!firstMessage ||
			!firstMessage.content ||
			!chatData.data.id ||
			chatData.data.title !== 'New conversation'
		) {
			return;
		}
		(async () => {
			const result = await actions.inbox.analyzeChatTitle({
				message: firstMessage.content,
			});
			await mutate.conversations.update(chatData.data.id, {
				title: result.result,
			});
		})();
	}, [chatData]);

	if (!chatData) {
		return null;
	}
	return (
		<ChatDrawerContent
			chat={chatData.data}
			thread={threadData ? new ClientThread(threadData?.data) : undefined}
		/>
	);
}

function ChatDrawerContent({
	chat,
	thread,
}: {
	chat: ChatConversationData;
	thread: ClientThread | undefined;
}) {
	const { messages, status, append } = useConversation({
		chat: chat,
		initialMessages: chat.chatMessages,
	});
	const latestMessage = messages[messages.length - 1];
	return (
		<>
			<DrawerHeader>
				<DrawerTitle>Chat: {chat.title}</DrawerTitle>
			</DrawerHeader>
			<Conversation>
				<ConversationContent className="px-px py-4">
					{thread && (
						<div className="group relative mb-2 flex w-full flex-col items-end justify-end gap-1">
							<div
								className="rounded bg-white outline outline-1 outline-black/20 group-hover:outline-black/30"
								style={{ height: 64, width: 380 }}
							>
								<ThreadEmbedListRow
									id={thread.id}
									index={0}
									thread={thread}
									condensed={true}
									isChecked={false}
									onChecked={() => {}}
									isFocused={false}
								/>
							</div>
						</div>
					)}
					{messages.map((message, i) => {
						switch (message.role) {
							case 'user':
								return <UserMessage key={message.id} message={message} />;
							case 'assistant':
								return (
									<AssistantMessage
										key={message.id}
										message={message}
										isStreaming={i === messages.length - 1 && status === 'streaming'}
									/>
								);
							default:
								return null;
						}
					})}
					{status === 'streaming' && latestMessage?.parts.at(-1)?.type !== 'text' && (
						<ReasoningMessage />
					)}
				</ConversationContent>
			</Conversation>
			<div className="mt-4 shrink-0">
				<ChatInput
					onSubmit={(e) => {
						e.preventDefault();
						const form = e.currentTarget;
						const formData = new FormData(form);
						const message = formData.get('message');
						invariant(message, 'form "message" is required');
						append(message as string);
						form.reset();
					}}
				/>
			</div>
		</>
	);
}

function UserMessage({ message }: { message: UIChatMessage }) {
	return (
		<div key={message.id} className="mb-6 text-md">
			<Message from={message.role} key={message.id}>
				<MessageContent>
					{message.parts.map((part, i) => {
						switch (part.type) {
							case 'text':
								return <Response key={`${message.id}-${i}`}>{part.text}</Response>;
							default:
								return null;
						}
					})}
				</MessageContent>
				{message.metadata?.timestamp && (
					<MessageTimestamp>
						{formatTimestamp(new Date(message.metadata.timestamp))}
					</MessageTimestamp>
				)}
			</Message>
		</div>
	);
}

function AssistantMessage({
	message,
	isStreaming,
}: {
	message: UIChatMessage;
	isStreaming: boolean;
}) {
	return (
		<div key={message.id} className="mb-10 space-y-2 text-md">
			{message.parts.map((part, index) => {
				if (part.type === 'text') {
					return (
						<Response key={index} className="mt-2">
							{part.text}
						</Response>
					);
				}
				if (part.type === 'tool-search') {
					return (
						<ToolMessage key={index}>
							<RiSearch2Line className="size-4" /> {part.type}{' '}
							{(part.input as { q: string } | undefined)?.q ?? ''}
						</ToolMessage>
					);
				}
				if (part.type.startsWith('tool-')) {
					return (
						<ToolMessage key={index}>
							<RiHammerLine className="size-4" /> {part.type.replace('tool-', '')}
						</ToolMessage>
					);
				}
				if (part.type === 'dynamic-tool') {
					return (
						<ToolMessage key={index}>
							<RiHammerLine className="size-4" /> {part.toolName}
						</ToolMessage>
					);
				}
				return null;
			})}
			{!isStreaming && (
				<Actions className="mt-2">
					<Action
						onClick={() => {
							const textToCopy = message.parts
								.filter((part) => part.type === 'text')
								.map((part) => part.text)
								.join('\n');
							void navigator.clipboard.writeText(textToCopy);
							toast.success('Copied to clipboard');
						}}
						label="Copy"
					>
						<RiFileCopyLine className="size-[18px]" />
					</Action>
					<Action onClick={() => {}} label="Upvote">
						<RiThumbUpLine className="size-[18px]" />
					</Action>
					<Action onClick={() => {}} label="Downvote">
						<RiThumbDownLine className="size-[18px]" />
					</Action>
				</Actions>
			)}
		</div>
	);
}

function ReasoningMessage({ className, children, ...props }: ComponentProps<'div'>) {
	return (
		<div
			className={cn(
				'mt-2 flex items-center gap-2 text-lg text-neutral-500 dark:text-neutral-400',
				className,
			)}
			{...props}
		>
			{children ?? (
				<>
					<RiBrainLine className="size-4" />
					<p>Thinking...</p>
				</>
			)}
		</div>
	);
}

function ToolMessage({ className, children, ...props }: ComponentProps<'div'>) {
	return (
		<div
			className={cn(
				'mb-2 flex items-center gap-2 text-lg text-neutral-500 dark:text-neutral-400',
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}
