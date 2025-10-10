import type { Collection } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';

export { accountId } from './auth.ts';
export { NULL } from './database.ts';
export { useLiveQuery };
import './connection.ts';
import { useMemo } from 'react';
import type { ConnectionStatus } from './connection.ts';
import { type Database, getDatabase, type TableCollections } from './database.ts';
import { useConnectionStatus } from './hooks/useConnectionStatus.ts';
export type QueryStatus = 'complete' | 'loading' | 'error';
export type QueryInfo = { status: QueryStatus; connectionStatus: ConnectionStatus };
type QueryResult<T> = [ReturnType<typeof useLiveQuery<T>>, QueryInfo];

export { useConnectionStatus };

export type UseQueryDeps = Parameters<typeof useLiveQuery>[1];

export function useQuery<T>(
	query: (db: Database) => Promise<T>,
	deps?: UseQueryDeps,
): QueryResult<T> {
	const { connectionStatus } = useConnectionStatus();
	const db = useMemo(() => getDatabase(), []);
	const data = useLiveQuery(() => query(db), deps);

	const status = data == null ? 'loading' : 'complete';
	const info = {
		status,
		connectionStatus,
	} as const;
	return [data, info];
}

export type { Collection };

export function relatedGet<T extends keyof TableCollections>(
	table: T,
	key: string,
	relatedKey: string,
) {
	const db = getDatabase();
	return db[table].get({ [key]: relatedKey });
}
