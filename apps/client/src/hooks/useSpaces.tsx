import { useQuery } from '@workspace/local/query.ts';
import type { SpaceData } from '@workspace/sync-data/data.js';
import { createContext, useContext } from 'react';
import { getCustomSpacesQuery } from '../lib/queries.ts';

const SpacesContext = createContext<{
	spaces: SpaceData[];
}>({
	spaces: [],
});

export function SpacesProvider({ children }: { children: React.ReactNode }) {
	const [spaces] = useQuery((db) => getCustomSpacesQuery(db).toArray());
	if (!spaces) {
		return null;
	}

	return (
		<SpacesContext.Provider value={{ spaces: spaces.map((s) => s.data) }}>
			{children}
		</SpacesContext.Provider>
	);
}

export function useSpaces() {
	const { spaces } = useContext(SpacesContext);
	return spaces || [];
}
