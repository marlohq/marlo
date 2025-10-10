import { RiAddCircleLine, RiCheckboxCircleFill, RiCircleFill } from '@remixicon/react';
import { useQuery } from '@workspace/local/query.ts';
import { Command, CommandGroup, CommandInput, CommandList } from '@workspace/ui';
import { invariant } from 'es-toolkit';
import { useState } from 'react';
import { useThreads } from '../../threads/hooks.ts';
import { addLabelsToThread, removeLabelsFromThread } from '../../threads/mutations.ts';
import { CommandViewFooter, CustomCommandItem } from './CommandView.tsx';
import { useCommandPaletteActions } from './context.tsx';

export function ThreadLabelsCommandView({ ids }: { ids: string[] }) {
	invariant(ids.length > 0, 'LabelsCommandView: ids must be a non-empty array');
	const { setOpen } = useCommandPaletteActions();
	const threads = useThreads(ids);
	const [labelsData] = useQuery((db) => db.labels.toArray());
	const [searchValue, setSearchValue] = useState('');
	// const thread = new ClientThread(data.data);
	const allLabels = labelsData ?? [];
	const filteredAllLabels = allLabels
		.filter((label) => label.data.remoteId && label.data.name)
		.filter((label) => label.data.name?.toLowerCase().includes(searchValue.toLowerCase()));
	const isSearchExactMatch = filteredAllLabels.some(
		(label) => label.data.name?.toLowerCase() === searchValue.toLowerCase(),
	);
	// We only show labels that are already on the thread when a single thread is passed.
	// Multiple threads will show the full list of labels, with no indication of which labels are already attached to which threads.
	const hasThreadLabelIds =
		threads.length === 1 ? (threads[0]?.labels ?? [])?.map((l) => l.labelId) : [];
	return (
		<Command shouldFilter={false}>
			<CommandInput
				value={searchValue}
				onValueChange={setSearchValue}
				autoFocus
				placeholder="Add or remove labels..."
			/>
			<CommandList>
				<CommandGroup heading="Labels">
					{filteredAllLabels.map((label) => {
						const hasThreadLabel = hasThreadLabelIds.some((labelId) => labelId === label.data.id);
						return (
							<CustomCommandItem
								key={label.data.id}
								value={label.data.id}
								label={label.data.name}
								icon={
									hasThreadLabel ? (
										<RiCheckboxCircleFill className="size-4" aria-hidden />
									) : (
										<RiCircleFill className="size-4 text-neutral-300" aria-hidden />
									)
								}
								run={async () => {
									await (hasThreadLabel
										? Promise.all(
												threads.map((thread) => removeLabelsFromThread(thread, label.data.id)),
											)
										: Promise.all(
												threads.map((thread) => addLabelsToThread(thread, label.data.id)),
											));
								}}
								closeOnSelect={false}
							/>
						);
					})}
					{searchValue && !isSearchExactMatch && (
						<CustomCommandItem
							label={`Create new label "${searchValue}"`}
							icon={<RiAddCircleLine className="size-4" aria-hidden />}
							run={() => {
								setOpen({
									type: 'label.create',
									ids: threads.map((thread) => thread.id),
									labelName: searchValue,
								});
							}}
							closeOnSelect={false}
						/>
					)}
				</CommandGroup>
			</CommandList>
			<CommandViewFooter threads={threads} />
		</Command>
	);
}
