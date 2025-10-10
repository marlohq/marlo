/** Represents any valid JSON value. */
export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];

/**
 * Represents a JSON object.
 *
 * `undefined` can't show up in JSON, but you can use it to remove keys before serialization, so
 * I've allowed it here.
 */
export type JsonObject = { [key: string]: JsonValue | undefined };

/**
 * Attempts to stringify a value as JSON, falling back to `String(value)` if it fails.
 *
 * **Do not rely on this being a parseable JSON string.** This is intended for viewing in logs and
 * UI.
 */
export function safeStringify(value: unknown) {
	try {
		// JSON.parse(undefined) returns undefined, lol?
		if (value === undefined) {
			return 'undefined';
		}
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

/** Returns `true` if the given value is a valid JSON string and can be parsed without errors. */
export function isValidJsonString(value: unknown): value is string {
	if (typeof value !== 'string') {
		return false;
	}
	try {
		JSON.parse(value);
		return true;
	} catch {
		return false;
	}
}

/** Safely parse JSON, returning a result object with success and data fields. */
export function safeJsonParse(input: unknown) {
	try {
		const data = JSON.parse(input as string) as JsonValue;
		return { success: true, data, error: null } as const;
	} catch (error) {
		return { success: false, data: null, error } as const;
	}
}

export function isJsonValue(value: unknown): value is JsonValue {
	return (
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean' ||
		value === null ||
		(Array.isArray(value) && value.every(isJsonValue)) ||
		(typeof value === 'object' && Object.values(value).every(isJsonValue))
	);
}
