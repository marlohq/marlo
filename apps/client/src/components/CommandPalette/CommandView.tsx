import {
	RiArrowDownSLine,
	RiArrowUpSLine,
	RiCornerDownLeftLine,
	RiLoader2Line,
} from '@remixicon/react';
import type { MaybePromise } from '@workspace/core/types.js';
import { CommandIcon, CommandItem } from '@workspace/ui';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { AnyCommandArgs, Command, CommandAction } from '../../commands/util.ts';
import type { ClientThread } from '../../threads/model.ts';
import { KeyboardShortcutBadge } from '../KeyboardShortcutBadge.tsx';
import { useCommandPaletteActions } from './context.tsx';

export function CommandViewFooter({ threads }: { threads?: ClientThread[] }) {
	if (!threads || !threads.length) return null;
	return (
		<div className="flex h-10 w-full items-center justify-between border-t border-t-neutral-100 bg-neutral-50 px-3">
			<div className="flex h-6 w-fit max-w-44 items-center gap-1.5">
				<h2 className="truncate text-xs text-neutral-600">
					{threads.length === 1
						? threads[0]?.subject
						: `${threads.length} selected thread${threads.length === 1 ? '' : 's'}`}
				</h2>
			</div>
			<div className="ml-auto flex items-center gap-4">
				<div className="flex items-center gap-1">
					<span className="text-sm text-neutral-600">Navigate</span>
					<div className="flex size-6 min-w-6 items-center justify-center rounded-md bg-neutral-200">
						<RiArrowUpSLine className="size-3 text-neutral-600" aria-hidden />
					</div>
					<div className="flex size-6 min-w-6 items-center justify-center rounded-md bg-neutral-200">
						<RiArrowDownSLine className="size-3 text-neutral-600" aria-hidden />
					</div>
				</div>
				<div className="flex items-center gap-1">
					<span className="text-sm text-neutral-600">Select</span>
					<div className="flex size-6 min-w-6 items-center justify-center rounded-md bg-neutral-200">
						<RiCornerDownLeftLine className="size-3 text-neutral-600" aria-hidden />
					</div>
				</div>
			</div>
		</div>
	);
}

export function LinkCommandItem({
	to,
	value,
	icon,
	keywords,
	children,
}: {
	to: string;
	icon: React.ReactNode;
	value?: string;
	keywords?: string[];
	children: React.ReactNode;
}) {
	const { setOpen } = useCommandPaletteActions();
	const navigate = useNavigate();
	return (
		<Link to={to}>
			<CommandItem
				value={value}
				keywords={keywords}
				onSelect={() => {
					navigate(to);
					setOpen(false);
				}}
			>
				<CommandIcon>{icon}</CommandIcon>
				{children}
			</CommandItem>
		</Link>
	);
}

export function ExternalLinkCommandItem({
	href,
	keywords,
	children,
}: {
	href: string;
	keywords?: string[];
	children: React.ReactNode;
}) {
	const { setOpen } = useCommandPaletteActions();
	return (
		<a href={href} target="_blank" rel="noopener noreferrer">
			<CommandItem
				value={href}
				keywords={keywords}
				onSelect={() => {
					window.open(href, '_blank', 'noopener,noreferrer');
					setOpen(false);
				}}
			>
				{children}
			</CommandItem>
		</a>
	);
}

export function BasicCommandItem<CommandArgs extends AnyCommandArgs>({
	command,
	action,
	keywords,
	children,
	closeOnSelect = true,
}: {
	command: Command<CommandArgs>;
	action: CommandAction;
	closeOnSelect?: boolean;
	keywords?: string[];
	children?: React.ReactNode;
}) {
	const { setOpen } = useCommandPaletteActions();
	const [inProgress, setInProgress] = useState(false);
	return (
		<CommandItem
			className="flex justify-between gap-2"
			keywords={keywords}
			onSelect={() => {
				const result = action.run();
				if (!(result instanceof Promise)) {
					closeOnSelect && setOpen(false);
					return;
				}
				setInProgress(true);
				result.finally(() => {
					setInProgress(false);
					closeOnSelect && setOpen(false);
				});
			}}
		>
			{children ?? (
				<>
					<CommandIcon>
						<command.icon className="size-full" aria-hidden />
					</CommandIcon>
					<div className="flex flex-1 items-center gap-2">{action.label()}</div>
				</>
			)}
			{inProgress ? (
				<RiLoader2Line className="size-5 animate-spin text-neutral-600" aria-hidden />
			) : command.shortcut ? (
				<KeyboardShortcutBadge shortcut={command.shortcut} />
			) : null}
		</CommandItem>
	);
}

export function CustomCommandItem({
	label,
	children,
	secondary,
	value,
	icon,
	run,
	keywords,
	closeOnSelect = true,
}: {
	label?: string;
	children?: React.ReactNode;
	secondary?: string;
	value?: string;
	icon: React.ReactNode;
	run: () => MaybePromise<unknown>;
	keywords?: string[];
	closeOnSelect?: boolean;
}) {
	const { setOpen } = useCommandPaletteActions();
	const [inProgress, setInProgress] = useState(false);
	return (
		<CommandItem
			className="flex justify-between gap-2"
			keywords={keywords}
			value={value}
			onSelect={() => {
				const result = run();
				if (!(result instanceof Promise)) {
					closeOnSelect && setOpen(false);
					return;
				}
				setInProgress(true);
				result.finally(() => {
					setInProgress(false);
					closeOnSelect && setOpen(false);
				});
			}}
		>
			<CommandIcon>{icon}</CommandIcon>
			{children ?? <div className="flex-1 items-center gap-2 truncate">{label}</div>}
			{inProgress ? (
				<RiLoader2Line className="size-5 animate-spin text-neutral-600" aria-hidden />
			) : (
				<span className="shrink-0 text-sm text-neutral-500">{secondary}</span>
			)}
		</CommandItem>
	);
}
