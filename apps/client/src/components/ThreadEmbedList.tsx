import { Checkbox } from '@workspace/ui';
import { type ComponentType, type RefObject, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { VirtuosoHandle } from 'react-virtuoso';
import { useCurrentAccount } from '../hooks/useCurrentAccount.tsx';
import {
	cn,
	formatShortDate,
	formatThreadFromField,
	getSenderAvatarSrc,
	getThreadLink,
} from '../lib/util.ts';
import type { ClientThread } from '../threads/model.ts';
import { type CommandPaletteView, useCommandPaletteActions } from './CommandPalette/context.tsx';
import { ImageWithFallback } from './ImageWithFallback.tsx';
import { TABLE_LIST_ROW_ID, TableList } from './TableList.tsx';

export type ThreadRowItem = {
	id: string;
	key?: string;
	type: 'thread';
	thread: ClientThread;
};

function extractThreadIds(items: ThreadRowItem[]): string[] {
	const threadIds: string[] = [];
	for (const item of items) {
		threadIds.push(item.thread.id);
	}
	return threadIds;
}

function getContext({
	checkedItems,
	highlightedItem,
}: {
	checkedItems: ThreadRowItem[];
	highlightedItem: ThreadRowItem | null;
}): CommandPaletteView | undefined {
	if (checkedItems.length > 0) {
		const threadIds = extractThreadIds(checkedItems);
		if (threadIds.length > 0) {
			return { type: 'thread', ids: threadIds };
		}
	}
	if (highlightedItem) {
		const threadIds = extractThreadIds([highlightedItem]);
		if (threadIds.length > 0) {
			return { type: 'thread', ids: threadIds };
		}
	}
	return undefined;
}

export function ThreadEmbedList({
	ref,
	id,
	data,
	autoFocus,
	condensed,
	className,
	style,
	onFocusEscape,
	onCheckedItemsChange,
	onHighlightedItemChange,
	onSelectedItemChange,
	onEndReached,
	header,
	footer,
	isActive,
}: {
	ref: RefObject<VirtuosoHandle | null>;
	id: string;
	data: ThreadRowItem[];
	autoFocus?: boolean;
	condensed?: boolean;
	className?: string;
	style?: React.CSSProperties;
	onFocusEscape?: (direction: 'up' | 'down') => void;
	onCheckedItemsChange?: (ids: string[]) => void;
	onHighlightedItemChange?: (item: ThreadRowItem | null) => void;
	onSelectedItemChange?: (ids: string[]) => void;
	onEndReached?: () => void;
	header?: ComponentType;
	footer?: ComponentType;
	isActive: () => boolean;
}) {
	const [checkedItems, setCheckedItems] = useState<string[]>([]);

	return (
		<TableList
			id={id}
			key={id}
			ref={ref}
			items={data}
			autoFocus={autoFocus}
			className={className}
			style={style}
			getSortValue={(item) => {
				if (item.type === 'thread') {
					return item.thread.lastSentAt.getTime();
				}
			}}
			checkbox={true}
			persistSelection={true}
			header={header}
			footer={footer}
			checkedItems={checkedItems}
			onCheckedItemsChange={(ids) => {
				setCheckedItems(ids);
				onCheckedItemsChange?.(ids);
			}}
			onHighlightedItemChange={onHighlightedItemChange}
			onSelectedItemChange={onSelectedItemChange}
			onFocusEscape={onFocusEscape}
			onEndReached={onEndReached}
			isActive={isActive}
			getContext={getContext}
			isReachable={() => {
				return true;
			}}
			render={(item, props, index) => {
				return (
					<ThreadEmbedListRow
						{...props}
						condensed={condensed}
						key={item.key ?? props.id}
						thread={item.thread}
						index={index}
					/>
				);
			}}
		/>
	);
}

export function ThreadEmbedListRow({
	id,
	thread,
	condensed,
	isChecked,
	onChecked,
	isFocused,
}: {
	id: string;
	index: number;
	thread: ClientThread;
	condensed?: boolean;
	isChecked?: boolean;
	onChecked: (ids: string, isShiftClick: boolean) => void;
	isFocused?: boolean;
}) {
	const { setOpen } = useCommandPaletteActions();
	const currentAccount = useCurrentAccount();
	const checkboxRef = useRef<HTMLButtonElement>(null);
	const draftId = thread.messages.find((m) => !m.deletedAt && !!m.draftId)?.draftId;
	const nonDraftMessages = thread.messages.filter((m) => !m.deletedAt && !m.draftId);

	return (
		<Link
			{...{ [TABLE_LIST_ROW_ID]: id }}
			data-focused={isFocused ? 'true' : undefined}
			to={
				draftId && nonDraftMessages.length === 0 ? `/compose/${draftId}` : getThreadLink(thread.id)
			}
			className={cn(
				'group relative flex h-[58px] w-full select-none items-center border-b border-neutral-100 outline-1 -outline-offset-1',
				condensed && 'h-16 border-none pl-4',
				isChecked && 'bg-neutral-100',
				isFocused && 'z-10 bg-neutral-100 outline',
				isChecked && isFocused && 'bg-neutral-500/10',
			)}
			onContextMenu={(e) => {
				e.preventDefault();
				e.stopPropagation();
				setOpen({ type: 'thread', ids: [thread.id] });
			}}
		>
			{!condensed && (
				/* biome-ignore lint/a11y/useKeyWithClickEvents: Needed to improve the click-area (mouse-only). */
				/* biome-ignore lint/a11y/noStaticElementInteractions: Needed to improve the click-area (mouse-only). */
				<div
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						onChecked(thread.id, e.nativeEvent.shiftKey);
					}}
					className={cn(
						'flex h-[42px] w-10 items-center justify-center transition-opacity',
						'opacity-100', // : 'hover:opacity-100 sm:opacity-0',
					)}
				>
					<Checkbox
						tabIndex={-1}
						ref={checkboxRef}
						aria-label="Select thread"
						checked={isChecked}
						onClick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							onChecked(thread.id, e.nativeEvent.shiftKey);
						}}
					/>
				</div>
			)}
			<ImageWithFallback
				className="h-8 w-8 rounded-full bg-neutral-200"
				src={getSenderAvatarSrc(thread.messages[0].senderEmail)}
				alt=""
				fallback={<div className="size-8 rounded-full bg-neutral-300" />}
			/>
			<div className="w-3 shrink-0" />
			<div className="inline-flex flex-1 shrink flex-col items-start justify-start leading-snug">
				<div className="line-clamp-1 w-full justify-start break-all text-sm font-normal text-neutral-500">
					{formatThreadFromField(
						nonDraftMessages.map((message) => ({
							senderName: message.senderName,
							senderEmail: message.senderEmail,
						})),
						currentAccount.email,
					)}
				</div>
				<div className="line-clamp-1 justify-start break-all font-medium text-neutral-900">
					{thread.subject}
				</div>
			</div>
			<div className="w-2 shrink-0" />
			<div className="flex shrink-0 justify-start font-normal text-neutral-600">
				{formatShortDate(thread.lastSentAt)}
			</div>
			<div className="w-4 shrink-0" />
		</Link>
	);
}
