import type { DialogProps } from '@radix-ui/react-dialog';
import { RiAddCircleFill } from '@remixicon/react';
import { Command as CommandPrimitive } from 'cmdk';
import * as React from 'react';
import { twc } from 'react-twc';
import { cn } from '../lib/utils.ts';
import { Dialog, DialogContent } from './dialog.tsx';

const CommandIcon = twc.div`size-5 p-0.5 flex items-center justify-center opacity-75`;
CommandIcon.displayName = 'CommandIcon';

const Command = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
	<CommandPrimitive
		ref={ref}
		className={cn(
			'flex h-full w-full flex-col overflow-hidden rounded-md bg-white text-neutral-950 outline-none dark:bg-neutral-950 dark:text-neutral-50',
			className,
		)}
		{...props}
	/>
));
Command.displayName = CommandPrimitive.displayName;

const CommandDialog = ({ children, ...props }: DialogProps) => {
	return (
		<Dialog {...props}>
			<DialogContent className="overflow-hidden p-0">
				<Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-neutral-500 dark:[&_[cmdk-group-heading]]:text-neutral-400 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
					{children}
				</Command>
			</DialogContent>
		</Dialog>
	);
};

const CommandInput = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive.Input>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input> & { isPending?: boolean }
>(({ className, isPending, ...props }, ref) => (
	<div className="flex items-center gap-2 border-b px-4 py-1" cmdk-input-wrapper="">
		<CommandPrimitive.Input
			ref={ref}
			className={cn(
				'flex h-12 w-full rounded-md bg-transparent text-xl outline-none placeholder:text-neutral-500 disabled:cursor-not-allowed disabled:opacity-50 dark:placeholder:text-neutral-400',
				className,
			)}
			{...props}
		/>
		{isPending && <RiAddCircleFill className="size-6 pt-1 text-neutral-600" aria-hidden />}
	</div>
));

CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandNoInput = () => (
	// biome-ignore lint/a11y: This is the correct focus workaround for cmdk
	<button autoFocus type="button" aria-hidden="true" className="sr-only" />
);
CommandNoInput.displayName = 'CommandNoInput';

const CommandList = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive.List>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
	<CommandPrimitive.List
		ref={ref}
		className={cn('overflow-y-auto overflow-x-hidden', className)}
		style={{
			minHeight: 0,
			maxHeight: 360,
			height: 'var(--cmdk-list-height)',
			transition: 'height 120ms ease-in-out',
		}}
		{...props}
	/>
));

CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive.Empty>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
	<CommandPrimitive.Empty ref={ref} className="flex flex-col py-6 text-center text-sm" {...props} />
));

CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandGroup = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive.Group>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
	<CommandPrimitive.Group
		ref={ref}
		className={cn(
			'overflow-hidden p-1.5 text-neutral-950 dark:text-neutral-50 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-neutral-500 dark:[&_[cmdk-group-heading]]:text-neutral-400',
			className,
		)}
		{...props}
	/>
));

CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandSeparator = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive.Separator>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
	<CommandPrimitive.Separator
		ref={ref}
		className={cn('-mx-1 h-px bg-neutral-200 dark:bg-neutral-800', className)}
		{...props}
	/>
));
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

const CommandItem = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive.Item>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
	<CommandPrimitive.Item
		ref={ref}
		className={cn(
			'relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-2 text-sm font-normal text-neutral-700 outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-neutral-100 data-[selected=true]:text-neutral-900 data-[disabled=true]:opacity-50 dark:data-[selected=true]:bg-neutral-800 dark:data-[selected=true]:text-neutral-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
			className,
		)}
		{...props}
	/>
));

CommandItem.displayName = CommandPrimitive.Item.displayName;

const CommandShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => {
	return (
		<span
			className={cn(
				'ml-auto text-xs tracking-widest text-neutral-500 dark:text-neutral-400',
				className,
			)}
			{...props}
		/>
	);
};
CommandShortcut.displayName = 'CommandShortcut';

export {
	Command,
	CommandIcon,
	CommandDialog,
	CommandInput,
	CommandNoInput,
	CommandList,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandShortcut,
	CommandSeparator,
};
