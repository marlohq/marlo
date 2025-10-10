import { type ComponentType, type RefObject, useMemo, useState } from 'react';
import type { VirtuosoHandle } from 'react-virtuoso';
import type { ClientThread } from '../threads/model.ts';
import type { CommandPaletteView } from './CommandPalette/context.tsx';
import { MultiSelectDynamicIsland } from './MultiSelectDynamicIsland.tsx';
import { TableList } from './TableList.tsx';
import { ThreadTableListHeader, ThreadTableListRow } from './ThreadTableListRow.tsx';

export type HeaderRowItem = {
	id: string;
	key?: string;
	type: 'header';
	title: string;
	icon?: React.ReactNode;
	action?: React.ReactNode;
	size?: number | string;
};

export type CustomRowItem = {
	id: string;
	key?: string;
	type: 'custom';
	reachable: boolean;
	checkable: boolean;
	threads?: () => ClientThread[];
	render: Parameters<typeof TableList>[0]['render'];
};

export type ThreadRowItem = {
	id: string;
	key?: string;
	type: 'thread';
	thread: ClientThread;
};

function extractThreadIds(items: (HeaderRowItem | CustomRowItem | ThreadRowItem)[]): string[] {
	const threadIds: string[] = [];
	for (const item of items) {
		if (item.type === 'thread') {
			threadIds.push(item.thread.id);
		}
	}
	return threadIds;
}

function getContext({
	checkedItems,
	highlightedItem,
}: {
	checkedItems: (HeaderRowItem | CustomRowItem | ThreadRowItem)[];
	highlightedItem: (HeaderRowItem | CustomRowItem | ThreadRowItem) | null;
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

export function ThreadTableList({
	ref,
	id,
	data,
	island,
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
	data: (HeaderRowItem | CustomRowItem | ThreadRowItem)[];
	island?: boolean;
	autoFocus?: boolean;
	condensed?: boolean;
	className?: string;
	style?: React.CSSProperties;
	onFocusEscape?: (direction: 'up' | 'down') => void;
	onCheckedItemsChange?: (ids: string[]) => void;
	onHighlightedItemChange?: (item: (HeaderRowItem | CustomRowItem | ThreadRowItem) | null) => void;
	onSelectedItemChange?: (ids: string[]) => void;
	onEndReached?: () => void;
	header?: ComponentType;
	footer?: ComponentType;
	isActive: () => boolean;
}) {
	const [checkedItems, setCheckedItems] = useState<string[]>([]);
	const selectedThreadIds = useMemo(() => {
		const selectedItems = data.filter((item) => checkedItems.includes(item.id));
		return extractThreadIds(selectedItems);
	}, [data, checkedItems]);

	return (
		<>
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
				persistSelection={false}
				isReachable={(item, isMultiSelectMode) => {
					if (item.type === 'thread') {
						return true;
					}
					if (item.type === 'custom') {
						if (!item.reachable) {
							return false;
						}
						if (!item.checkable && isMultiSelectMode) {
							return false;
						}
						return true;
					}
					return false;
				}}
				render={(item, props, index) => {
					if (item.type === 'header') {
						return (
							<ThreadTableListHeader
								{...item}
								key={item.key ?? item.id}
								index={index}
								condensed={condensed}
							/>
						);
					} else if (item.type === 'custom') {
						return item.render(item, props, index);
					} else if (item.type === 'thread') {
						return (
							<ThreadTableListRow
								{...props}
								key={item.key ?? props.id}
								thread={item.thread}
								index={index}
								condensed={condensed}
							/>
						);
					}
				}}
			/>
			{island && (
				<MultiSelectDynamicIsland
					threadIds={selectedThreadIds}
					onClear={() => setCheckedItems([])}
				/>
			)}
		</>
	);
}
