import { RiAddCircleLine, RiTriangleFill } from '@remixicon/react';
import { createId } from '@workspace/core/util.js';
import { mutate } from '@workspace/local/mutate.js';
import { useQuery } from '@workspace/local/query.ts';
import { Command, CommandGroup, CommandInput, CommandList } from '@workspace/ui';
import { invariant } from 'es-toolkit';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useCurrentAccount } from '../../hooks/useCurrentAccount.tsx';
import { getSpaceDisplayName } from '../../lib/util.ts';
import { useThreads } from '../../threads/hooks.ts';
import type { ClientThread } from '../../threads/model.ts';
import { CommandViewFooter, CustomCommandItem } from './CommandView.tsx';

async function addThreadToSpace(threads: ClientThread[], spaceId: string) {
	await mutate.threads.bulkUpdate(
		threads.map((thread) => ({
			key: thread.id,
			changes: {
				spaceId,
				...(thread.category === 'junk' ? { category: null } : {}),
			},
		})),
	);
}

export function ThreadSpacesCommandView({ ids }: { ids: string[] }) {
	invariant(ids.length > 0, 'ThreadSpacesCommandView: ids must be a non-empty array');
	const threads = useThreads(ids);
	const currentAccount = useCurrentAccount();
	const navigate = useNavigate();
	const [spacesData] = useQuery((db) => db.spaces.toArray());
	const [searchValue, setSearchValue] = useState('');

	const allSpaces = spacesData ?? [];
	const filteredAllSpaces = allSpaces
		.filter((space) => space.data.id)
		.filter((space) =>
			getSpaceDisplayName(space.data.name).toLowerCase().includes(searchValue.toLowerCase()),
		);

	return (
		<Command shouldFilter={false}>
			<CommandInput
				value={searchValue}
				onValueChange={setSearchValue}
				autoFocus
				placeholder="Add or remove from spaces..."
			/>
			<CommandList>
				<CommandGroup heading="Spaces">
					{filteredAllSpaces.map((space) => {
						return (
							<CustomCommandItem
								key={space.data.id}
								value={space.data.id}
								label={getSpaceDisplayName(space.data.name)}
								icon={<RiTriangleFill className="size-4" aria-hidden />}
								run={async () => {
									await addThreadToSpace(threads, space.data.id);
								}}
								closeOnSelect={true}
							/>
						);
					})}
					<CustomCommandItem
						label={`Create new space${searchValue ? ` "${searchValue}"` : '...'}`}
						icon={<RiAddCircleLine className="size-4" aria-hidden />}
						run={async () => {
							const id = createId();
							await mutate.spaces.create({
								id,
								accountId: currentAccount.id,
								name: searchValue,
								filters: [],
								properties: [],
								actions: [],
								createdAt: new Date(),
								groupBy: '',
								sortBy: '',
							});
							await addThreadToSpace(threads, id);
							navigate(`/spaces/${id}`);
						}}
						closeOnSelect={true}
					/>
				</CommandGroup>
			</CommandList>
			<CommandViewFooter threads={threads} />
		</Command>
	);
}
