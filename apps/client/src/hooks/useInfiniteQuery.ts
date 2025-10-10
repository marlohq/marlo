import type { Database } from '@workspace/local/database.ts';
import { type Collection, type UseQueryDeps, useQuery } from '@workspace/local/query.ts';
import { useState } from 'react';
import { DEFAULT_THREAD_PAGE_SIZE_LIMIT } from '../lib/queries.ts';

/**
 * This is a helper hook for infinite scrolling of the ThreadTableList. Pass data and onEndReached
 * to the ThreadTableList.
 */
export function useInfiniteQuery<TTable, T extends { data: TTable }>(
	query: (db: Database) => Collection<T>,
	deps: UseQueryDeps = [],
	options?: {
		initialLimit?: number;
		pageSize?: number;
	},
) {
	const initialLimit = options?.initialLimit ?? DEFAULT_THREAD_PAGE_SIZE_LIMIT;
	const pageSize = options?.pageSize ?? DEFAULT_THREAD_PAGE_SIZE_LIMIT;
	const [limit, setLimit] = useState<number>(initialLimit);
	const [rows, info] = useQuery((db) => query(db).limit(limit).toArray(), [...deps, limit]);

	return {
		rows,
		limit,
		info,
		onEndReached: () => {
			// If there is no data, the 'onEndReached' table event is meaningless. Safe to ignore.
			if (!Array.isArray(rows)) {
				return;
			}
			// If the data array is smaller than the requested limit, then we are also safe to ignore.
			// We would only need to refetch if we had loaded the maximum, and needed more.
			if (rows.length < limit) {
				return;
			}
			// NOTE(fks): This will degrade performance as 1000s of results are loaded into memory.
			// The Zero team is working on more guidance for infinite scroll, to follow once available.
			// See: https://discord.com/channels/830183651022471199/1333156033593479309
			setLimit((prev) => prev + pageSize);
		},
	};
}
