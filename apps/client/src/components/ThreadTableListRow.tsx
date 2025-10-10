import { RiSquareFill, RiTimerFlashFill } from '@remixicon/react';
import type { CategoryId } from '@workspace/categories/types.js';
import { Badge, Checkbox, Tooltip, TooltipContent, TooltipTrigger } from '@workspace/ui';
import { useRef } from 'react';
import { Link } from 'react-router';
import { twc } from 'react-twc';
import { useCurrentAccount } from '../hooks/useCurrentAccount.tsx';
import { getCategoryClientModule } from '../lib/categories.ts';
import { cn, formatShortDate, formatThreadFromField, getThreadLink } from '../lib/util.ts';
import type { ClientThread } from '../threads/model.ts';
import { useCommandPaletteActions } from './CommandPalette/context.tsx';
import { TABLE_LIST_ROW_ID } from './TableList.tsx';

const SHOW_BADGES_FOR_APPS = new Set<CategoryId>([
	'promotions',
	'newsletters',
	'receipts',
	'authentication',
	'delivery',
	'invoice',
	'reservation',
	'junk',
	'calendar',
]);

function getCardStatusBadge({
	hasUnread,
	hasResolved,
	reminderTriggeredAt,
}: {
	hasUnread: boolean;
	hasResolved: boolean;
	reminderTriggeredAt: Date | undefined | null;
}) {
	if (reminderTriggeredAt) {
		return (
			<Tooltip>
				<TooltipTrigger>
					<StatusBadge className="bg-orange-500 opacity-100" />
				</TooltipTrigger>
				<TooltipContent>{`Reminder triggered at ${formatShortDate(reminderTriggeredAt)}`}</TooltipContent>
			</Tooltip>
		);
	}
	if (hasUnread) {
		return <StatusBadge className="bg-blue-500 opacity-100" />;
	}
}

const StatusBadge = twc.div`size-2 shrink-0 rounded-full bg-blue-500 opacity-0 transition-opacity`;

export function ThreadTableListHeader(item: {
	index: number;
	title: string;
	icon?: React.ReactNode;
	size?: number | string;
	condensed?: boolean;
}) {
	return (
		<div
			className={cn(
				`flex h-[58px] items-center justify-between gap-4 pl-4 pr-7 pt-4 leading-none text-neutral-500`,
				!item.condensed && 'sm:pl-10',
				item.index === 0 && 'h-[42px] pt-0.5',
			)}
		>
			<div className="flex items-center gap-2.5">
				{item.icon && <div className="flex shrink-0 items-center justify-center">{item.icon}</div>}
				<div className="flex items-baseline gap-2">
					<span className="">{item.title}</span>
				</div>
			</div>
		</div>
	);
}

export function ThreadTableListRow({
	id,
	index,
	thread,
	condensed,
	isChecked,
	isMultiSelectMode,
	onChecked,
	isFocused,
}: {
	id: string;
	index: number;
	thread: ClientThread;
	condensed?: boolean;
	isChecked?: boolean;
	isMultiSelectMode: boolean;
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
				'group relative flex h-[42px] w-full select-none items-center pl-4 text-left text-neutral-900 outline-1 -outline-offset-1',
				!condensed && 'sm:pl-2',
				isChecked && 'bg-neutral-100',
				isFocused && 'z-10 bg-neutral-100 outline',
				isChecked && isMultiSelectMode && isFocused && 'bg-neutral-500/10',
			)}
			onContextMenu={(e) => {
				e.preventDefault();
				e.stopPropagation();
				setOpen({ type: 'thread', ids: [thread.id] });
			}}
		>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: Needed to improve the click-area (mouse-only). */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: Needed to improve the click-area (mouse-only). */}
			<div
				onClick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					onChecked(thread.id, e.nativeEvent.shiftKey);
				}}
				className={cn(
					'mr-2 flex h-[42px] w-8 items-center justify-center transition-opacity',
					!condensed && 'sm:mr-0',
					condensed || isChecked ? 'opacity-100' : 'hover:opacity-100 sm:opacity-0',
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
			<div className="flex h-full w-full flex-1 items-center justify-between gap-1.5 overflow-hidden">
				<p
					className={cn(
						'flex w-32 items-center gap-1.5 overflow-hidden pr-6',
						'sm:w-56 lg:w-[268px]',
					)}
				>
					{nonDraftMessages.length > 0 ? (
						<span className={cn('truncate', 'font-medium')}>
							{formatThreadFromField(
								nonDraftMessages.map((message) => ({
									senderName: message.senderName,
									senderEmail: message.senderEmail,
								})),
								currentAccount.email,
							)}
						</span>
					) : null}

					{nonDraftMessages.length >= 2 ? (
						<span className="font-normal text-neutral-500">{nonDraftMessages.length}</span>
					) : draftId ? null : (
						(() => {
							const categoryId = thread.category as CategoryId | null;
							if (!categoryId || !SHOW_BADGES_FOR_APPS.has(categoryId)) return null;
							const categoryModule = getCategoryClientModule(categoryId);
							const contents = categoryModule.getBadgeContents?.(thread) ?? (
								<categoryModule.icon className="size-3.5 shrink-0" />
							);
							return (
								<span
									key={categoryId}
									className="flex shrink-0 items-center gap-1 text-sm text-neutral-500 [&_svg]:text-[#bbbbbb]"
								>
									{contents}
								</span>
							);
						})()
					)}
					{draftId && <span className="text-orange-500">Draft</span>}
				</p>
				<div className="flex size-4 items-center justify-center">
					{getCardStatusBadge({
						hasUnread: !thread.read,
						hasResolved: !!thread.resolvedAt,
						reminderTriggeredAt: (() => {
							return thread.data?.reminderTriggeredAt
								? new Date(thread.data.reminderTriggeredAt)
								: null;
						})(),
					})}
				</div>
				<div className="flex flex-1 items-center gap-4 overflow-hidden">
					<span className="truncate font-medium">{thread.subject || 'No Subject'}</span>
					<span className="flex-1 truncate whitespace-nowrap text-neutral-500">
						{thread.snippet}
					</span>
				</div>
				{(() => {
					return thread.spacePropertyList.map((value) => {
						return (
							<Badge variant="secondary" key={value.id}>
								<RiSquareFill className="size-2.5 shrink-0" />
								{/* TODO(fks): Build a better serializer than String()*/}
								{String(value.value)}
							</Badge>
						);
					});
				})()}
				{(() => {
					const { remindAt, reminderTriggeredAt } = thread.data;
					if (!remindAt || reminderTriggeredAt) {
						return null;
					}
					return (
						<Tooltip>
							<TooltipTrigger>
								<RiTimerFlashFill className="size-5 text-orange-500" aria-hidden />
							</TooltipTrigger>
							<TooltipContent>{`Reminder set for ${formatShortDate(new Date(remindAt))}`}</TooltipContent>
						</Tooltip>
					);
				})()}
				<time className="block min-w-16 shrink-0 text-end leading-tight text-neutral-500">
					{formatShortDate(thread.lastSentAt)}
				</time>
				<div className={cn('-mr-1 flex w-4 shrink-0')}></div>
			</div>
		</Link>
	);
}
