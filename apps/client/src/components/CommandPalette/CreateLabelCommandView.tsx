import { RiCircleFill } from '@remixicon/react';
import { createId } from '@workspace/core/util.js';
import { mutate } from '@workspace/local/mutate.js';
import { Command, CommandGroup, CommandInput, CommandList } from '@workspace/ui';
import { invariant } from 'es-toolkit';
import { useState } from 'react';
import { actions } from '../../lib/actions.ts';
import { useThreads } from '../../threads/hooks.ts';
import { CustomCommandItem } from './CommandView.tsx';

const SUPPORTED_COLORS = ['gray', 'orange', 'green', 'blue', 'red', 'purple', 'violet'] as const;

export function CreateLabelCommandView({ ids, labelName }: { ids: string[]; labelName: string }) {
	invariant(ids.length > 0, 'LabelsCommandView: ids must be a non-empty array');
	const [searchValue, setSearchValue] = useState('');
	const threads = useThreads(ids);

	const colors = SUPPORTED_COLORS.filter((color) =>
		color.toLowerCase().includes(searchValue.toLowerCase()),
	);

	// TODO: Implement color selection for labels
	async function onSubmit(_color: string) {
		const labelId = createId();
		mutate.labels.create({
			id: labelId,
			name: labelName,
			type: 'user',
			remoteId: `PLACEHOLDER/${labelId}`,
		});
		actions.google.sync({
			action: { id: 'label:create', labelId, name: labelName },
			remoteThreadIds: threads.map((thread) => thread.remoteId),
		});
	}

	return (
		<Command>
			<CommandInput
				value={searchValue}
				onValueChange={setSearchValue}
				autoFocus
				placeholder="Select a color..."
			/>
			<CommandList>
				<CommandGroup heading="Labels">
					{colors.map((color) => {
						return (
							<CustomCommandItem
								key={color}
								value={color}
								label={color}
								icon={
									<RiCircleFill className="size-4 text-neutral-300" style={{ color }} aria-hidden />
								}
								run={() => {
									onSubmit(color);
								}}
							/>
						);
					})}
				</CommandGroup>
			</CommandList>
		</Command>
	);
}
