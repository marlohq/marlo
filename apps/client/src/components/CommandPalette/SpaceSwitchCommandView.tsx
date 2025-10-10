import { RiCornerDownLeftLine, RiTriangleFill } from '@remixicon/react';
import { useQuery } from '@workspace/local/query.ts';
import { Command, CommandGroup, CommandInput, CommandList } from '@workspace/ui';
import { useState } from 'react';
import { getCustomSpacesQuery } from '../../lib/queries.ts';
import { getSpaceDisplayName } from '../../lib/util.ts';
import { LinkCommandItem } from './CommandView.tsx';

export function SpaceSwitchCommandView() {
	const [spaces] = useQuery((db) => getCustomSpacesQuery(db).limit(100).toArray());
	const [search, setSearch] = useState('');
	return (
		<Command>
			<CommandInput
				value={search}
				onValueChange={setSearch}
				autoFocus
				placeholder="Go to space..."
			/>
			<CommandList>
				<CommandGroup>
					{spaces?.map((space) => (
						<LinkCommandItem
							key={space.data.id}
							value={getSpaceDisplayName(space.data.name)}
							icon={<RiTriangleFill className="size-4" aria-hidden />}
							to={`/spaces/${space.data.id}`}
						>
							{getSpaceDisplayName(space.data.name)}
						</LinkCommandItem>
					))}
				</CommandGroup>
			</CommandList>

			<div className="mt-2 flex h-10 w-full items-center justify-between border-t border-t-neutral-100 bg-neutral-50 px-3">
				<div className="flex h-6 w-fit max-w-44 items-center gap-1.5"></div>

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
	);
}
