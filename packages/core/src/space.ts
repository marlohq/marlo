export const BUILTIN_SPACES = {
	inbox: 'Inbox',
};

export type BuiltInSpaceId = keyof typeof BUILTIN_SPACES;

export function getInboxSpaceId(accountId: string): string {
	return `inbox_${accountId}`;
}

export type FilterFieldType = {
	from: string;
	to: string;
	cc: string;
	bcc: string;
	subject: string;
	body: string;
	date: Date;
	hasAttachments: boolean;
	labels: string[];
	categories: string[];
};

export type FilterField = keyof FilterFieldType;

export type FilterOperator =
	| 'eq'
	| 'ne'
	| 'lt'
	| 'lte'
	| 'gt'
	| 'gte'
	| 'contains'
	| 'not_contains'
	| 'in'
	| 'not_in';

export interface StructuredFilter<
	T extends FilterField = FilterField,
	O extends FilterOperator = FilterOperator,
> {
	field: T;
	// Determine valid operators based on field type
	operator: FilterFieldType[T] extends unknown[]
		? O extends 'contains' | 'not_contains'
			? O // Arrays can use contains/not_contains
			: never
		: O extends 'contains' | 'not_contains'
			? FilterFieldType[T] extends string
				? O // Strings can use contains/not_contains
				: never
			: O extends 'lt' | 'lte' | 'gt' | 'gte'
				? FilterFieldType[T] extends number | Date
					? O // Numbers and dates can use comparison operators
					: never
				: O; // All other operators are allowed
	// Determine value type based on field type and operator
	value: FilterFieldType[T] extends unknown[]
		? O extends 'contains' | 'not_contains'
			? FilterFieldType[T][number][] // For array fields with contains, expect array of element type
			: never
		: O extends 'in' | 'not_in'
			? FilterFieldType[T][]
			: FilterFieldType[T]; // For 'in' operators expect array value, otherwise single value
}

export interface NaturalFilter {
	query: string;
}

export type Filter =
	| {
			[K in FilterField]: {
				[O in FilterOperator]: StructuredFilter<K, O>;
			}[FilterOperator];
	  }[FilterField]
	| NaturalFilter;

export type FilterGroup = Filter[]; // Implicit AND
export type SpaceFilter = FilterGroup[]; // Implicit OR

export type PropertyType = 'string';

export interface SpaceProperty {
	id: string; // UUID
	name: string;
	type: PropertyType;
	prompt: string;
}

export type SpaceProperties = SpaceProperty[];

export interface ActionRunResult {
	success: boolean;
	reasoningText: string;
	toolCalls: {
		toolName: string;
		parameters: Record<string, unknown>;
		result?: unknown;
	}[];
}
