import {
	Command,
	CommandGroup,
	CommandItem,
	CommandList,
	Input,
	Popover,
	PopoverAnchor,
	PopoverContent,
} from '@workspace/ui';
import { type ComponentProps, useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../lib/util.ts';

// Helper function to merge refs
const mergeRefs = <T,>(
	...refs: Array<React.MutableRefObject<T> | React.LegacyRef<T> | null | undefined>
): React.RefCallback<T> => {
	return (value) => {
		for (const ref of refs) {
			if (typeof ref === 'function') {
				ref(value);
			} else if (ref != null) {
				(ref as React.MutableRefObject<T | null>).current = value;
			}
		}
	};
};

interface GenericAutocompleteProps<T> {
	items: T[];
	onSelect: (value: string) => void;
	onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
	inputProps: ComponentProps<'input'>;
	getItemValue: (item: T) => string;
	getItemKey: (item: T) => string;
	renderItem: (item: T) => React.ReactNode;
	validateInput?: (input: string) => { isValid: boolean; errorMessage?: string };
	isOpen?: boolean;
	setIsOpen?: (open: boolean) => void;
	searchValue: string;
	setSearchValue: (value: string) => void;
	placeholder?: string;
	className?: string;
	isSelectOnBlur?: boolean;
	isBlurOnSelect?: boolean;
	autoSelectFirstItem?: boolean;
	ref?: React.RefObject<HTMLInputElement | null>;
	onBlur?: () => void;
	onFocus?: () => void;
	onRestoreFocus?: () => void;
}

export function GenericAutocomplete<T>({
	items,
	className,
	onSelect,
	isSelectOnBlur = false,
	isBlurOnSelect = true,
	autoSelectFirstItem = false,
	onKeyDown,
	inputProps,
	getItemValue,
	getItemKey,
	renderItem,
	validateInput,
	searchValue,
	setSearchValue,
	placeholder,
	ref: externalRef,
	onBlur,
	onFocus,
	onRestoreFocus,
}: GenericAutocompleteProps<T>) {
	const inputRef = useRef<HTMLInputElement | null>(null);
	const measureSpanRef = useRef<HTMLSpanElement | null>(null);
	const [isOpen, setIsOpen] = useState(false);
	const [selectedItem, setSelectedItem] = useState<string>('NO_VALUE_SELECTED');
	const [errorState, setErrorState] = useState<
		{ isOpen: true; message: string } | { isOpen: false; message: undefined }
	>({
		isOpen: false,
		message: undefined,
	});

	function handleInputFocus() {
		inputRef.current?.focus();
		onFocus?.();
	}

	function handleInputBlur(e: React.FocusEvent<HTMLInputElement>) {
		inputRef.current?.blur();
		onBlur?.();
		if (isSelectOnBlur && !!searchValue.trim() && (!validateInput || validate(searchValue))) {
			onSelect(searchValue);
			setSearchValue('');
		}
	}

	function showInputError(message: string) {
		setErrorState({ isOpen: true, message });
	}

	function clearInputError() {
		setErrorState({ isOpen: false, message: undefined });
	}

	function validate(input: string): boolean {
		if (!validateInput) return true;
		const result = validateInput(input);
		if (!result.isValid && result.errorMessage) {
			showInputError(result.errorMessage);
		}
		return result.isValid;
	}

	// Width of the input should be as wide as the text content.
	// This weirdly isn't possible with CSS, so we create an invisible element
	// with the same text and measure its width.
	function updateInputWidth() {
		if (!measureSpanRef.current || !inputRef.current) {
			return;
		}

		const width = measureSpanRef.current.offsetWidth;
		// Use flex-basis to ensure the input still flexes to the full width of the row (flex: 1),
		// but is at least as wide as the text. That behavior is not possible with `width` or `min-width`.
		// Fun fact: this is the technique that Gmail uses.
		inputRef.current.style.flexBasis = `${Math.max(20, width + 10)}px`;
	}

	const isShown = isOpen && searchValue.length > 0 && items.length > 0;

	// biome-ignore lint/correctness/useExhaustiveDependencies: Intentional custom trigger.
	useEffect(() => {
		updateInputWidth();
	}, [searchValue]);

	useEffect(() => {
		if (selectedItem !== 'NO_VALUE_SELECTED') {
			if (!items.some((item) => getItemValue(item) === selectedItem)) {
				setSelectedItem('NO_VALUE_SELECTED');
			}
		}
	}, [items, getItemValue, selectedItem]);

	useEffect(() => {
		if (isShown && autoSelectFirstItem) {
			const firstItem = items[0];
			if (firstItem) {
				setSelectedItem(getItemValue(firstItem));
			}
		}
	}, [items, getItemValue, autoSelectFirstItem, isShown]);

	const onSelectItem = (inputValue: string) => {
		onSelect(inputValue);
		clearInputError();
		if (isBlurOnSelect) {
			setIsOpen(false);
			inputRef.current?.blur();
		}
	};

	// Collapse the dropdown when clicking outside
	const handleOutsideClick = useCallback((e: MouseEvent) => {
		if (inputRef.current && !inputRef.current.contains(e.target as Node) && !e.defaultPrevented) {
			setIsOpen(false);
		}
	}, []);

	useEffect(() => {
		if (isShown) {
			document.addEventListener('click', handleOutsideClick);
		} else {
			document.removeEventListener('click', handleOutsideClick);
		}

		return () => {
			document.removeEventListener('click', handleOutsideClick);
		};
	}, [isShown, handleOutsideClick]);

	return (
		<Popover open={isShown}>
			<Command
				className="contents"
				value={selectedItem}
				onValueChange={(value) => {
					setSelectedItem(value);
				}}
				shouldFilter={false}
				onKeyDown={(e) => {
					if (e.key === 'Enter') {
						e.stopPropagation();
					}
				}}
			>
				{/* Invisible span to compute how wide the input should be.
                Ensure the input is the width of text it contains. */}
				<span
					ref={measureSpanRef}
					className="invisible fixed -top-full whitespace-pre px-1"
					aria-hidden="true"
				>
					{searchValue}
				</span>
				<PopoverAnchor asChild>
					<Input
						{...inputProps}
						data-address-field
						ref={mergeRefs(inputRef, externalRef)}
						value={searchValue}
						placeholder={placeholder ?? inputProps.placeholder}
						onChange={(e) => {
							setSearchValue(e.target.value);
						}}
						onKeyDown={(e) => {
							clearInputError();
							setIsOpen(true);
							onKeyDown?.(e);
							switch (e.key) {
								case 'Escape':
									setIsOpen(false);
									inputRef.current?.blur();
									break;
								case 'Enter':
									e.preventDefault();
									// Use the selected item from the dropdown
									if (selectedItem !== 'NO_VALUE_SELECTED') {
										onSelectItem(selectedItem);
										return;
									}
									// Otherwise, use the current input value if it's valid
									if (validate(e.currentTarget.value)) {
										onSelectItem(e.currentTarget.value);
									}
									break;
								default:
								// do nothing
							}
						}}
						onBlur={handleInputBlur}
						onFocus={() => {
							setIsOpen(true);
							handleInputFocus();
						}}
						className={cn(className, errorState.isOpen && 'text-red-500 dark:text-red-900')}
						title={errorState.isOpen ? errorState.message : undefined}
						style={{ flexBasis: '20px' }}
					/>
				</PopoverAnchor>
				<PopoverContent
					align="start"
					animate={false}
					onOpenAutoFocus={(e) => e.preventDefault()}
					onInteractOutside={(e) => {
						if (e.target instanceof Element && e.target.hasAttribute('cmdk-input')) {
							e.preventDefault();
						}
					}}
					className="min-w-[260px] bg-white p-0"
					style={{
						width: 'var(--radix-popover-trigger-width)',
					}}
				>
					<CommandList
						style={{
							minHeight: '0px',
							height: 'var(--cmdk-list-height)',
							maxHeight: '500px',
						}}
					>
						<CommandGroup>
							{items.map((item, index) => (
								<CommandItem
									key={getItemKey(item)}
									value={getItemValue(item)}
									onMouseDown={(e) => e.preventDefault()}
									onSelect={onSelectItem}
								>
									{renderItem(item)}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</PopoverContent>
			</Command>
		</Popover>
	);
}
