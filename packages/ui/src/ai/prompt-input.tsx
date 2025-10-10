import { RiArrowUpLine } from '@remixicon/react';
import type { ChatStatus } from 'ai';
import { Loader2Icon, SquareIcon, XIcon } from 'lucide-react';
import type { ComponentProps, HTMLAttributes, KeyboardEventHandler } from 'react';
import { Children } from 'react';
import { Button } from '../components/button.tsx';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '../components/select.tsx';
import { Textarea } from '../components/textarea.tsx';
import { cn } from '../lib/utils.ts';

export type PromptInputProps = HTMLAttributes<HTMLFormElement>;

export const PromptInput = ({ className, ...props }: PromptInputProps) => (
	<form
		className={cn(
			'group w-full overflow-hidden rounded-md bg-white outline outline-1 outline-neutral-900/10 focus-within:outline-neutral-900/20',
			className,
		)}
		style={{ boxShadow: '0px 2px 3px -1px rgba(0,0,0,0.2)' }}
		{...props}
	/>
);

export type PromptInputTextareaProps = ComponentProps<typeof Textarea> & {
	minHeight?: number;
	maxHeight?: number;
};

export const PromptInputTextarea = ({
	onChange,
	className,
	placeholder = 'Ask Marlo...',
	minHeight = 48,
	maxHeight = 164,
	...props
}: PromptInputTextareaProps) => {
	const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
		if (e.key === 'Enter') {
			// Don't submit if IME composition is in progress
			if (e.nativeEvent.isComposing) {
				return;
			}

			if (e.shiftKey) {
				// Allow newline
				return;
			}

			// Submit on Enter (without Shift)
			e.preventDefault();
			const form = e.currentTarget.form;
			if (form) {
				form.requestSubmit();
			}
		}
	};

	return (
		<Textarea
			className={cn(
				'w-full resize-none rounded-none border-none p-2 pb-0 shadow-none outline-none ring-0',
				'field-sizing-content max-h-[6lh] bg-transparent dark:bg-transparent',
				'focus-visible:ring-0',
				className,
			)}
			// @ts-expect-error - fieldSizing is not yet a part of the official React.CSSProperties type
			style={{ fieldSizing: 'content' }}
			name="message"
			onChange={(e) => {
				onChange?.(e);
			}}
			onKeyDown={handleKeyDown}
			placeholder={placeholder}
			rows={1}
			{...props}
		/>
	);
};

export type PromptInputToolbarProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputToolbar = ({ className, ...props }: PromptInputToolbarProps) => (
	<div className={cn('flex items-center justify-between p-2', className)} {...props} />
);

export type PromptInputToolsProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputTools = ({ className, ...props }: PromptInputToolsProps) => (
	<div
		className={cn('flex items-center gap-1', '[&_button:first-child]:rounded-bl-xl', className)}
		{...props}
	/>
);

export type PromptInputButtonProps = ComponentProps<typeof Button>;

export const PromptInputButton = ({
	variant = 'ghost',
	className,
	size,
	...props
}: PromptInputButtonProps) => {
	const newSize = (size ?? Children.count(props.children) > 1) ? 'default' : 'icon';

	return (
		<Button
			className={cn(
				'shrink-0 gap-1.5 rounded-lg',
				variant === 'ghost' && 'text-muted-foreground',
				newSize === 'default' && 'px-3',
				className,
			)}
			size={newSize}
			type="button"
			variant={variant}
			{...props}
		/>
	);
};

export type PromptInputSubmitProps = ComponentProps<typeof Button> & {
	status?: ChatStatus;
};

export const PromptInputSubmit = ({
	className,
	variant = 'default',
	size = 'icon',
	status,
	children,
	...props
}: PromptInputSubmitProps) => {
	let Icon = <RiArrowUpLine className="size-4" />;

	if (status === 'submitted') {
		Icon = <Loader2Icon className="size-4 animate-spin" />;
	} else if (status === 'streaming') {
		Icon = <SquareIcon className="size-4" />;
	} else if (status === 'error') {
		Icon = <XIcon className="size-4" />;
	}

	return (
		<Button
			className={cn(
				'size-7 gap-1.5 rounded-full transition-none group-focus-within:bg-blue-600 group-focus-within:text-white',
				className,
			)}
			size={size}
			type="submit"
			variant={variant}
			{...props}
		>
			{children ?? Icon}
		</Button>
	);
};

export type PromptInputModelSelectProps = ComponentProps<typeof Select>;

export const PromptInputModelSelect = (props: PromptInputModelSelectProps) => <Select {...props} />;

export type PromptInputModelSelectTriggerProps = ComponentProps<typeof SelectTrigger>;

export const PromptInputModelSelectTrigger = ({
	className,
	...props
}: PromptInputModelSelectTriggerProps) => (
	<SelectTrigger
		className={cn(
			'border-none bg-transparent font-medium text-neutral-500 shadow-none transition-colors dark:text-neutral-400',
			'[&[aria-expanded=true]]:text-foreground hover:bg-neutral-100 hover:text-neutral-950 dark:hover:bg-neutral-800 dark:hover:text-neutral-50 [&[aria-expanded=true]]:bg-neutral-100 dark:[&[aria-expanded=true]]:bg-neutral-800',
			className,
		)}
		{...props}
	/>
);

export type PromptInputModelSelectContentProps = ComponentProps<typeof SelectContent>;

export const PromptInputModelSelectContent = ({
	className,
	...props
}: PromptInputModelSelectContentProps) => <SelectContent className={cn(className)} {...props} />;

export type PromptInputModelSelectItemProps = ComponentProps<typeof SelectItem>;

export const PromptInputModelSelectItem = ({
	className,
	...props
}: PromptInputModelSelectItemProps) => <SelectItem className={cn(className)} {...props} />;

export type PromptInputModelSelectValueProps = ComponentProps<typeof SelectValue>;

export const PromptInputModelSelectValue = ({
	className,
	...props
}: PromptInputModelSelectValueProps) => <SelectValue className={cn(className)} {...props} />;
