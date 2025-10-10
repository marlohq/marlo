import { invariant } from 'es-toolkit';
import {
	type ComponentType,
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from 'react';
import { type StateSnapshot, Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { isInputField, isKeyEventMatch } from '../commands/util.ts';
import { useDocumentEventListener } from '../hooks/useDocumentEventListener.ts';
import { cn } from '../lib/util.ts';
import type { CommandPaletteView } from './CommandPalette/context.tsx';

export const TABLE_LIST_ROW_ID = 'data-row-id';

// Store the last highlighted item in memory, so that we can restore it when the user navigates back to the page.
const highlightedItemHistoryMap = new Map<
	string,
	{ state: StateSnapshot; highlightedItemIndex: number }
>();

function focusItem(id: string, preventScroll: boolean) {
	const tableSelector = `[data-virtuoso-scroller][data-active="true"] [data-testid="virtuoso-item-list"]`;
	const tableElement = document.querySelector(tableSelector) as HTMLElement | null;
	// React Virtuoso will hide the table element while it is initializing.
	// This can cause a problem where the item's DOM element exists on the page, but is not visible
	// and therefore cannot be focused. In the future, we can replace this with a checkVisibility()
	// call directly on the row element, once browsers better support it.
	if (!tableElement || tableElement.style.visibility === 'hidden') {
		return false;
	}
	const itemRowSelector = `[${TABLE_LIST_ROW_ID}="${id}"]`;
	const itemRowElement = tableElement.querySelector(itemRowSelector) as HTMLElement | null;
	if (!itemRowElement) {
		return false;
	}
	if (itemRowElement === document.activeElement) {
		return true;
	}
	itemRowElement.focus({ preventScroll });
	return true;
}

export function TableList<T extends { id: string; key?: string }>({
	id,
	items,
	getSortValue,
	ref,
	autoFocus,
	render,
	checkbox: isCheckboxEnabled,
	checkedItems: checkedItemIds,
	onCheckedItemsChange,
	onHighlightedItemChange,
	onSelectedItemChange,
	onFocusEscape,
	onEndReached,
	onStartReached,
	header,
	footer,
	isReachable,
	isActive,
	firstItemIndex,
	className,
	style,
	getContext,
	persistSelection,
}: {
	id: string;
	items: T[];
	getSortValue?: (item: T) => number | undefined;
	ref: RefObject<VirtuosoHandle | null>;
	autoFocus?: boolean;
	checkbox: boolean;
	render: (
		item: T,
		props: {
			id: string;
			isChecked: boolean;
			isFocused: boolean;
			isMultiSelectMode: boolean;
			onChecked: (id: string, isShiftClick: boolean) => void;
		},
		index: number,
	) => React.ReactNode;
	checkedItems?: string[];
	onCheckedItemsChange?: (ids: string[]) => void;
	onHighlightedItemChange?: (item: T | null) => void;
	onSelectedItemChange?: (ids: string[]) => void;
	onFocusEscape?: (direction: 'up' | 'down') => void;
	onEndReached?: () => void;
	onStartReached?: () => void;
	isReachable?: (item: T, isMultiSelectMode: boolean) => boolean;
	isActive: () => boolean;
	header?: ComponentType;
	footer?: ComponentType;
	firstItemIndex?: number;
	className?: string;
	style?: React.CSSProperties;
	getContext?: (params: {
		checkedItems: T[];
		highlightedItem: T | null;
	}) => CommandPaletteView | undefined;
	persistSelection?: boolean;
}) {
	const [historyId] = useState(`${id}:${window.history.length}`);
	const [highlightedItem, setHighlightedItem] = useState<T | null>(null);
	const [focusedItem, setFocusedItem] = useState<T | null>(null);
	const checkedItems = useMemo(() => {
		if (!checkedItemIds) {
			return [];
		}
		return items.filter((item) => checkedItemIds.includes(item.id));
	}, [items, checkedItemIds]);
	const [lastCheckedId, setLastCheckedId] = useState<string | null>(null);
	const [isKeyboardMode, setIsKeyboardMode] = useState(false);
	const isMultiSelectMode = checkedItems.length > 0;

	const highlightedItemIndex = items.findIndex((item) => item.id === highlightedItem?.id);
	let nextIndex = highlightedItemIndex + 1;
	let next = items[nextIndex];
	while (next && isReachable && !isReachable(next, isMultiSelectMode)) {
		nextIndex++;
		next = items[nextIndex];
	}
	let prevIndex = highlightedItemIndex - 1;
	let prev = items[prevIndex];
	while (prev && isReachable && !isReachable(prev, isMultiSelectMode)) {
		prevIndex--;
		prev = items[prevIndex];
	}

	const [previousHighlightState] = useState<
		{ state: StateSnapshot; highlightedItemIndex: number } | undefined
	>(highlightedItemHistoryMap.get(historyId));

	// biome-ignore lint/correctness/useExhaustiveDependencies: only on mount.
	useEffect(() => {
		const previousHighlightedItemIndex =
			previousHighlightState?.highlightedItemIndex ?? (autoFocus ? 0 : undefined);
		if (previousHighlightedItemIndex === undefined) {
			return;
		}
		const previousHighlightedItem = items[previousHighlightedItemIndex];
		if (!previousHighlightedItem) {
			highlightedItemHistoryMap.delete(historyId);
			return;
		}
		setIsKeyboardMode(true);
		let count = 0;
		const timeout = setInterval(() => {
			count++;
			const result = focusItem(previousHighlightedItem.id, true);
			if (result || count > 10) {
				highlightedItemHistoryMap.delete(historyId);
				clearInterval(timeout);
			}
		}, 100);
	}, []);

	useEffect(() => {
		return () => {
			if (!highlightedItemIndex || !isKeyboardMode) {
				return;
			}
			if (!ref?.current) {
				return;
			}
			ref.current.getState((state) => {
				highlightedItemHistoryMap.set(historyId, { state, highlightedItemIndex });
			});
		};
	}, [highlightedItemIndex, isKeyboardMode, historyId, ref?.current]);

	useEffect(() => {
		if (!getSortValue || !highlightedItem || highlightedItemIndex !== -1) {
			return;
		}
		if (items.length === 0) {
			setHighlightedItem(null);
			return;
		}
		const highlightedItemSortValue = getSortValue(highlightedItem);
		if (!highlightedItemSortValue) {
			setHighlightedItem(items[0] ?? null);
			return;
		}
		// Find the item with the closest value <= the highlighted item's sort value
		// This is the item that should be highlighted after the current item is removed.
		// NOTE(fks): Originally I'd attempted to track this by updating the index of
		// the highlighted item, but this was problematic because the "correct" index changed
		// based on how many items were removed, and from where in the list they were removed.
		// This seemed like a more reliable way to track the highlighted item without additional state.
		let closestPreviousItem: T | null = null;
		let closestDistance = Number.POSITIVE_INFINITY;

		for (const item of items) {
			const itemSortValue = getSortValue(item);
			if (itemSortValue === undefined) {
				continue;
			}
			if (itemSortValue > highlightedItemSortValue) {
				continue;
			}
			const distance = highlightedItemSortValue - itemSortValue;
			if (distance < closestDistance) {
				closestDistance = distance;
				closestPreviousItem = item;
			}
		}

		if (!closestPreviousItem) {
			setHighlightedItem(items[0] ?? null);
			return;
		}

		const newHighlightItemIndex = items.findIndex((item) => item.id === closestPreviousItem.id);
		if (newHighlightItemIndex >= 0) {
			ref?.current?.scrollIntoView({
				index: newHighlightItemIndex,
				behavior: 'auto',
				done: () => {
					setHighlightedItem(closestPreviousItem);
				},
			});
		}
	}, [items, highlightedItem, highlightedItemIndex, ref, getSortValue]);

	// If `highlightedItem` changes, make sure that it is actually focused.
	// This is needed to make it so that the arrow keys actually update the focused element.
	useEffect(() => {
		highlightedItem && focusItem(highlightedItem.id, !isKeyboardMode);
	}, [highlightedItem, isKeyboardMode]);

	const currentContext = useMemo((): CommandPaletteView | undefined => {
		if (getContext) {
			return getContext({ checkedItems, highlightedItem });
		}
		return undefined;
	}, [getContext, checkedItems, highlightedItem]);

	// Checked items can be removed from the `items` array, so we need to update `checkedItemIds`
	// when this happens to keep it in sync. For example, if you select an item and then delete it,
	// the item will be removed from the `items` array and is no longer considered checked.
	useEffect(() => {
		if (checkedItems.length !== checkedItemIds?.length) {
			onCheckedItemsChange?.(checkedItems.map((item) => item.id));
		}
	}, [checkedItems, checkedItemIds, onCheckedItemsChange]);

	// Sync focusedItem with highlightedItem when highlightedItem changes
	useEffect(() => {
		setFocusedItem(highlightedItem);
	}, [highlightedItem]);

	// Call callback when highlightedItem changes
	useEffect(() => {
		onHighlightedItemChange?.(highlightedItem);
	}, [highlightedItem, onHighlightedItemChange]);

	// Call callback when selected items change (combined checked + highlighted logic)
	useEffect(() => {
		const selectedIds =
			checkedItemIds && checkedItemIds.length > 0
				? checkedItemIds
				: highlightedItem
					? [highlightedItem.id]
					: [];
		onSelectedItemChange?.(selectedIds);
	}, [checkedItemIds, highlightedItem, onSelectedItemChange]);

	// Handle focus leaving the table to clear focusedItem
	useEffect(() => {
		const tableSelector = `[data-virtuoso-scroller][data-active="true"]`;
		const virtuosoElement = document.querySelector(tableSelector) as HTMLElement | null;
		if (!virtuosoElement) return;

		const handleFocusOut = (event: FocusEvent) => {
			// Clear if focus moves outside the table
			if (!virtuosoElement.contains(event.relatedTarget as Node)) {
				setFocusedItem(null);
			}
		};

		virtuosoElement.addEventListener('focusout', handleFocusOut);
		return () => virtuosoElement.removeEventListener('focusout', handleFocusOut);
	}, []);

	const toggleCheckedItem = useCallback(
		(id: string, isShiftClick: boolean) => {
			const ids = items.map((item) => item.id);

			// Handle the simple, normal check/uncheck behavior here.
			if (!isShiftClick || !lastCheckedId) {
				const newSet = new Set<string>(checkedItemIds);
				newSet.has(id) ? newSet.delete(id) : newSet.add(id);
				setLastCheckedId(id);
				onCheckedItemsChange?.(Array.from(newSet));
				return;
			}

			// Handle the user shift-clicking the checkbox.
			// This is a bit more complex, because we need to select a range of items
			// between the last checked item and the currently clicked item.
			const newSet = new Set<string>();
			const startIndex = ids.indexOf(lastCheckedId);
			const endIndex = ids.indexOf(id);
			if (startIndex !== -1 && endIndex !== -1) {
				const minIndex = Math.min(startIndex, endIndex);
				const maxIndex = Math.max(startIndex, endIndex);
				const rangeIds = ids.slice(minIndex, maxIndex + 1);
				const isAdding = !newSet.has(id);
				for (const rangeId of rangeIds) {
					isAdding ? newSet.add(rangeId) : newSet.delete(rangeId);
				}
				setLastCheckedId(id);
				onCheckedItemsChange?.(Array.from(newSet));
				return;
			}

			// If nothing else worked, intentionally return and do nothing.
		},
		[items, lastCheckedId, checkedItemIds, onCheckedItemsChange],
	);

	const moveFocusTo = useCallback(
		({
			to,
			direction,
			isSelectMode,
		}: {
			to: T | undefined;
			direction: 'up' | 'down';
			isSelectMode: boolean;
		}) => {
			if (!to) {
				onFocusEscape?.(direction);
				return;
			}
			if (!highlightedItem) {
				setHighlightedItem(to);
				return;
			}
			// If we are not in select mode (shift key), then navigation rules are simple.
			// Highlight the target item, and you are done.
			if (!isSelectMode) {
				setHighlightedItem(to);
				return;
			}

			// If we are in select mode, things are a bit more complex.
			// If there are no checked items, toggle the currently highlighted item as checked.
			// This effectively switches us into that "multi-select" mode where we can now select multiple items
			// by holding the shift key and navigating.

			if (checkedItemIds && checkedItemIds.length === 0) {
				toggleCheckedItem(highlightedItem.id, false);
				return;
			}

			if (checkedItemIds && !checkedItemIds.includes(highlightedItem.id)) {
				toggleCheckedItem(highlightedItem.id, false);
				return;
			}

			if (checkedItemIds?.includes(to.id)) {
				toggleCheckedItem(highlightedItem.id, false);
				setHighlightedItem(to);
				return;
			}

			// If there are already checked items on the page, then navigating while holding the select key
			// will cause the items to be checked as we navigate.
			setHighlightedItem(to);
			toggleCheckedItem(to.id, false);
		},
		[checkedItemIds, highlightedItem, toggleCheckedItem, onFocusEscape],
	);

	const handleItemFocusChange = useCallback((item: T | null) => {
		setHighlightedItem(item);
	}, []);

	const handleMouseMove = useCallback(
		(event: React.MouseEvent) => {
			setIsKeyboardMode(false);
			const target = document.elementFromPoint(event.clientX, event.clientY);
			if (!target) {
				return;
			}
			const rowElement = target.closest(`[${TABLE_LIST_ROW_ID}]`);
			if (!rowElement) {
				return;
			}
			const rowId = rowElement.getAttribute(TABLE_LIST_ROW_ID);
			invariant(rowId, 'expected "TABLE_LIST_ROW_ID" attribute on row element');
			const item = items.find((item) => item.id === rowId);
			invariant(item, 'expected item to exist in items array');
			handleItemFocusChange(item);
		},
		[items, handleItemFocusChange],
	);

	const handleClick = useCallback(
		(event: React.MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
			handleItemFocusChange(items[0] ?? null);
		},
		[handleItemFocusChange, items],
	);

	useDocumentEventListener('keydown', (event) => {
		// If the current target is an input field or composer, ignore the event.
		if (isInputField(event)) {
			return;
		}
		// For the rest of the keys, ignore if the command palette is open.
		if (!isActive()) {
			return;
		}
		// if the escape key is pressed, close the command palette
		if (isKeyEventMatch(event, { key: 'Escape', modifiers: [] })) {
			event.preventDefault();
			event.stopPropagation();
			onCheckedItemsChange?.([]);
			if (!isMultiSelectMode && highlightedItem) {
				const highlightedItemRowElement = document.querySelector(
					`[${TABLE_LIST_ROW_ID}="${highlightedItem.id}"]`,
				) as HTMLElement | null;
				if (highlightedItemRowElement && highlightedItemRowElement === document.activeElement) {
					highlightedItemRowElement.blur();
				}
				setHighlightedItem(null);
				onFocusEscape?.('up');
			}
			return;
		}
		// if Command+A is pressed, select all rows in the table
		if (
			isCheckboxEnabled &&
			!isInputField(event) &&
			isKeyEventMatch(event, { key: 'a', modifiers: ['CommandOrControl'] })
		) {
			event.preventDefault();
			onCheckedItemsChange?.(items.map((item) => item.id));
			return;
		}
		// For the rest of the keys, ignore if there are no items.
		if (!items[0]) {
			return;
		}

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			setIsKeyboardMode(true);
			ref?.current?.scrollIntoView({
				index: nextIndex,
				behavior: 'auto',
				done: () => {
					moveFocusTo({
						to: next,
						direction: 'down',
						isSelectMode: isCheckboxEnabled && event.shiftKey,
					});
				},
			});
			return;
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			setIsKeyboardMode(true);
			ref?.current?.scrollIntoView({
				index: prevIndex,
				behavior: 'auto',
				done: () => {
					moveFocusTo({
						to: prev,
						direction: 'up',
						isSelectMode: isCheckboxEnabled && event.shiftKey,
					});
				},
			});
			return;
		}
	});

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: Only used for preventing propagation.
		// biome-ignore lint/a11y/noStaticElementInteractions: Only used for preventing propagation.
		<div
			className={cn('h-full w-full', className)}
			onMouseMove={handleMouseMove}
			onClick={handleClick}
			data-current-context={JSON.stringify(currentContext)}
			style={style}
		>
			<Virtuoso
				ref={ref}
				data-active={isActive()}
				className={cn(
					'no-scrollbar',
					isKeyboardMode
						? '[&_[data-row-id]]:outline-neutral-800/20'
						: '[&_[data-row-id]]:outline-transparent',
				)}
				// For some reason, passing firstItemIndex={undefined} causes an index error.
				// This is a workaround to avoid that and not pass the prop at all.
				{...(firstItemIndex !== undefined ? { firstItemIndex } : {})}
				// Disabled because we now have rows of variable height
				// fixedItemHeight={42}
				data={items}
				computeItemKey={(index, item) => item.key ?? item.id ?? `item-${index}`}
				endReached={onEndReached}
				startReached={onStartReached}
				// @ts-expect-error - TODO: benign react-virtuoso type issue, fix this as part of updating to v4.
				components={{ Header: header, Footer: footer }}
				restoreStateFrom={previousHighlightState?.state}
				itemContent={(index, item) => {
					invariant(item, 'expected item to be defined');
					const shouldBeFocused = persistSelection
						? isMultiSelectMode
							? focusedItem?.id === item.id
							: highlightedItem?.id === item.id
						: focusedItem?.id === item.id;
					return render(
						item,
						{
							id: item.id,
							isChecked: checkedItemIds?.includes(item.id) ?? false,
							isMultiSelectMode: isMultiSelectMode,
							onChecked: (id, isShiftClick) => toggleCheckedItem(id, isShiftClick),
							isFocused: shouldBeFocused,
						},
						index,
					);
				}}
			/>
		</div>
	);
}
