import type { IDType, Table } from 'dexie';

type NestedKey<T, K> = K extends `${infer A}.${infer B}` ? T[A][NestedKey<T[A], B>] : K;

declare module 'dexie' {
	export interface EntityTable<T, K extends NestedKey<T, K>> extends Table<T, IDType<T, K>> {
		bulkDelete(keys: NestedKey<T, K>[]): PromiseExtended<void>;
	}
}
