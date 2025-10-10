import { ulid } from 'ulidx';
import type { Falsy } from './types.ts';

/** Checks if a value is truthy. */
export function isTruthy<T>(value?: T): value is Exclude<T, Falsy> {
	return !!value;
}

export function createId() {
	return ulid();
}

export function isTemporaryId(id: string | null | undefined) {
	return id?.startsWith('ZZ');
}
