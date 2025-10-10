import { RiCornerDownLeftLine, RiTimeLine } from '@remixicon/react';

import { mutate } from '@workspace/local/mutate.js';
import { Command, CommandInput, CommandItem, CommandList } from '@workspace/ui';
import { parse as parseNaturalLanguageDate } from 'chrono-node';
import {
	addDays,
	formatRelative,
	nextMonday,
	nextSaturday,
	setHours,
	setMilliseconds,
	setMinutes,
	setSeconds,
} from 'date-fns';
import { invariant } from 'es-toolkit';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { formatTimestamp } from '../../lib/util.ts';
import { useThreads } from '../../threads/hooks.ts';
import type { ClientThread } from '../../threads/model.ts';
import { EmptyState } from '../EmptyState.tsx';
import { CustomCommandItem } from './CommandView.tsx';
import { useCommandPaletteActions } from './context.tsx';

/**
 * Suggest up to five likely completions for a partially typed date phrase. Use natural language
 * date parsing to suggest completions. Add to this over time, there are plenty of different ways
 * for the user to phrase their message.
 */
function parseDate(input: string): [string, Date][] {
	const now = new Date();
	const out: [string, Date][] = [];
	const text = input.trim().toLowerCase();

	// FORMAT: “in <number> ...”
	const inMatch = text.match(/^in\s*(\d*?)\s*([a-z]*)?$/);
	if (inMatch) {
		const value = Number(inMatch[1] || 1);
		const prefix = inMatch[2] ?? '';

		const units: Array<['minute' | 'hour' | 'day' | 'week' | 'month' | 'year', (d: Date) => void]> =
			[
				['minute', (d) => d.setMinutes(d.getMinutes() + value)],
				['hour', (d) => d.setHours(d.getHours() + value)],
				['day', (d) => d.setDate(d.getDate() + value)],
				['week', (d) => d.setDate(d.getDate() + value * 7)],
				['month', (d) => d.setMonth(d.getMonth() + value)],
				['year', (d) => d.setFullYear(d.getFullYear() + value)],
			];

		for (const [unit, mutator] of units) {
			if (unit.startsWith(prefix) && out.length < 5) {
				const label = `in ${value === 1 ? 'a' : value} ${unit}${value === 1 ? '' : 's'}`;
				const date = new Date(now);
				mutator(date);
				out.push([label, date]);
			}
		}
	}
	// FORMAT: “tomorrow”
	if (out.length < 5 && /^tom/.test(text)) {
		const tomorrow = new Date(now);
		tomorrow.setDate(now.getDate() + 1);
		out.push(['tomorrow', tomorrow]);
	}
	// FORMAT: Natural language fallback
	// This is our catch-all which uses the "chrono" package to parse out a natural language.
	// This is a powerful library, but it only returns a single result which is not ideal.
	if (out.length === 0) {
		const parsed = parseNaturalLanguageDate(text);
		if (parsed) {
			return parsed.map((p) => [p.text, p.date()]);
		}
	}

	return out.slice(0, 5);
}

function getTomorrowDate() {
	// Add 1 day to the current date to get tomorrow
	const tomorrow = addDays(new Date(), 1);
	// Set the time to 8:00.00 AM
	const tomorrowAt8AM = setMilliseconds(setSeconds(setMinutes(setHours(tomorrow, 8), 0), 0), 0);
	return tomorrowAt8AM;
}

function getThisWeekendDate() {
	// Add 1 day to the current date to get next saturday
	const nextSaturdayDate = nextSaturday(new Date());
	// Set the time to 8:00.00 AM
	const nextSaturdayAt8AM = setMilliseconds(
		setSeconds(setMinutes(setHours(nextSaturdayDate, 8), 0), 0),
		0,
	);
	return nextSaturdayAt8AM;
}

function getNextWeekDate() {
	// Add 1 day to the current date to get next saturday
	const nextMondayDate = nextMonday(new Date());
	// Set the time to 8:00.00 AM
	const nextMondayAt8AM = setMilliseconds(
		setSeconds(setMinutes(setHours(nextMondayDate, 8), 0), 0),
		0,
	);
	return nextMondayAt8AM;
}

async function setReminder(threads: ClientThread[], at: Date) {
	const now = new Date();
	await mutate.threads.bulkUpdate(
		threads.map((thread) => ({
			key: thread.id,
			changes: {
				resolvedAt: now,
				triagedAt: now,
				remindAt: at,
				reminderTriggeredAt: null,
			},
		})),
	);
	toast.success(`Reminder set for ${formatRelative(at, new Date())}.`);
}

async function removeReminder(threads: ClientThread[]) {
	const now = new Date();
	await mutate.threads.bulkUpdate(
		threads.map((thread) => ({
			key: thread.id,
			changes: {
				remindAt: null,
				reminderTriggeredAt: now,
			},
		})),
	);
	toast.success('Reminder removed.');
}

export function ThreadRemindCommandView({ ids }: { ids: string[] }) {
	invariant(ids.length > 0, 'ThreadRemindCommandView: ids must be a non-empty array');
	const [search, setSearch] = useState('');
	const [searchCandidates, setSearchCandidates] = useState<[string, Date][]>([]);
	const debouncedSetSearchCandidates = useCallback((value: string) => {
		if (!value) {
			setSearchCandidates([]);
			return;
		}
		const date = parseDate(value);
		setSearchCandidates(date.slice(0, 5));
	}, []);
	const { setOpen } = useCommandPaletteActions();
	const threads = useThreads(ids);

	return threads.length ? (
		<Command shouldFilter={false}>
			<CommandInput
				autoFocus
				placeholder="Remind me at..."
				value={search}
				onValueChange={(value) => {
					setSearch(value);
					debouncedSetSearchCandidates(value);
				}}
			/>
			<CommandList>
				{search ? (
					searchCandidates.map(([label, date]) => (
						<CustomCommandItem
							key={label}
							label={label}
							secondary={formatTimestamp(date)}
							icon={<RiTimeLine className="size-full" aria-hidden />}
							run={() => {
								setReminder(threads, date);
								setOpen(false);
							}}
						/>
					))
				) : (
					<>
						<CustomCommandItem
							label={'Tomorrow'}
							icon={<RiTimeLine className="size-full" aria-hidden />}
							run={() => {
								setReminder(threads, getTomorrowDate());
								setOpen(false);
							}}
						/>
						<CustomCommandItem
							label={'This weekend'}
							icon={<RiTimeLine className="size-full" aria-hidden />}
							run={() => {
								setReminder(threads, getThisWeekendDate());
								setOpen(false);
							}}
						/>
						<CustomCommandItem
							label={'Next week'}
							icon={<RiTimeLine className="size-full" aria-hidden />}
							run={() => {
								setReminder(threads, getNextWeekDate());
								setOpen(false);
							}}
						/>
					</>
				)}
				{threads.some((thread) => thread.data.remindAt) && (
					<CommandItem
						onSelect={() => {
							removeReminder(threads);
							setOpen(false);
						}}
					>
						<RiTimeLine aria-hidden />
						Remove reminder
					</CommandItem>
				)}
			</CommandList>

			<div className="flex h-10 w-full items-center justify-between border-t border-t-neutral-100 bg-neutral-50 px-3">
				<div className="flex h-6 w-fit max-w-44 items-center gap-1.5">
					<h2 className="truncate text-xs text-neutral-600">{threads[0]?.subject}</h2>
				</div>

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
	) : (
		<EmptyState message="No messages found." />
	);
}
