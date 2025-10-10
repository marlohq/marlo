import { RiChat3Fill, RiCornerDownLeftLine } from '@remixicon/react';
import { useQuery } from '@workspace/local/query.ts';
import type { ChatConversationData } from '@workspace/sync-data/data.js';
import { Command, CommandGroup, CommandInput, CommandList } from '@workspace/ui';
import { useState } from 'react';
import { formatTimestamp } from '../../lib/util.ts';
import { useChatDrawerActions } from '../ChatDrawer/context.tsx';
import { CustomCommandItem } from './CommandView.tsx';

function getLabel(conversation: ChatConversationData) {
	const lastMessage = conversation.chatMessages.at(-1);
	return (
		<div className="flex w-full items-center gap-1 text-left">
			{conversation.title && (
				<span className="font-medium text-neutral-900">{conversation.title}</span>
			)}
			<span className="line-clamp-1 w-full flex-1 overflow-hidden text-neutral-500">
				{lastMessage ? lastMessage.content.slice(0, 120) : ''}
			</span>
			<span className="shrink-0 text-sm text-neutral-500">
				{formatTimestamp(new Date(conversation.updatedAt || conversation.createdAt))}
			</span>
		</div>
	);
}

export function ConversationSwitchCommandView() {
	const { open: openChatDrawer } = useChatDrawerActions();
	const [conversations] = useQuery((db) =>
		db.conversations.limit(100).reverse().sortBy('data.updatedAt'),
	);
	const [search, setSearch] = useState('');
	return (
		<Command>
			<CommandInput
				value={search}
				onValueChange={setSearch}
				autoFocus
				placeholder="Search chats..."
			/>
			<CommandList>
				<CommandGroup heading="Recent">
					{conversations?.map((conversation) => (
						<CustomCommandItem
							key={conversation.data.id}
							value={conversation.data.id}
							icon={<RiChat3Fill className="size-4" aria-hidden />}
							run={() => openChatDrawer(conversation.data.id)}
							closeOnSelect={true}
						>
							{getLabel(conversation.data)}
						</CustomCommandItem>
					))}
				</CommandGroup>
			</CommandList>

			<div className="mt-2 flex h-10 w-full items-center justify-between border-t border-t-neutral-100 bg-neutral-50 px-3">
				<div className="flex h-6 w-fit max-w-44 items-center gap-1.5"></div>

				<div className="flex items-center gap-4">
					<div className="flex items-center gap-1.5">
						<span className="text-sm text-neutral-600">Cancel</span>
						<div className="flex h-6 w-fit items-center justify-center rounded-md bg-neutral-200 px-1.5">
							<span className="text-xs text-neutral-600">Esc</span>
						</div>
					</div>
					<div className="flex items-center gap-1.5">
						<span className="text-sm text-neutral-600">Confirm</span>
						<div className="flex size-6 min-w-6 items-center justify-center rounded-md bg-neutral-200">
							<RiCornerDownLeftLine className="size-3 text-neutral-600" aria-hidden />
						</div>
					</div>
				</div>
			</div>
		</Command>
	);
}
