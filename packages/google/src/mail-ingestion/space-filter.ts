import type { MessageWithRelations } from '@workspace/core/drizzle.js';
import type {
	Filter,
	FilterField,
	FilterOperator,
	SpaceFilter,
	StructuredFilter,
} from '@workspace/core/space.js';

export function filterForSpace(
	filter: SpaceFilter,
	mail: MessageWithRelations,
	naturalQueryResults?: { [query: string]: boolean },
	category?: string,
): boolean {
	return filter.some((filterGroup) =>
		filterGroup.every((singleFilter) =>
			evaluateFilter(singleFilter, mail, naturalQueryResults, category),
		),
	);
}

export function evaluateFilter(
	filter: Filter,
	mail: MessageWithRelations,
	naturalQueryResults?: { [query: string]: boolean },
	category?: string,
): boolean {
	if ('query' in filter) {
		// Use precomputed natural language query results if available
		if (naturalQueryResults && filter.query in naturalQueryResults) {
			return naturalQueryResults[filter.query] ?? false;
		}
		// If no precomputed results, return false (query should have been evaluated separately)
		return false;
	}

	return evaluateStructuredFilter(filter, mail, category);
}

function evaluateStructuredFilter(
	filter: StructuredFilter,
	mail: MessageWithRelations,
	category?: string,
): boolean {
	const fieldValue = getFieldValue(filter.field, mail, category);
	const filterValue = filter.value;

	const operator = filter.operator as FilterOperator; // Type assertion to handle conditional type

	switch (operator) {
		case 'eq':
			return isEqual(fieldValue, filterValue);
		case 'ne':
			return !isEqual(fieldValue, filterValue);
		case 'lt':
			return isLessThan(fieldValue, filterValue);
		case 'lte':
			return isLessThanOrEqual(fieldValue, filterValue);
		case 'gt':
			return isGreaterThan(fieldValue, filterValue);
		case 'gte':
			return isGreaterThanOrEqual(fieldValue, filterValue);
		case 'contains':
			return evaluateContains(fieldValue, filterValue);
		case 'not_contains':
			return !evaluateContains(fieldValue, filterValue);
		case 'in':
			return Array.isArray(filterValue) && filterValue.some((v) => isEqual(fieldValue, v));
		case 'not_in':
			return !Array.isArray(filterValue) || !filterValue.some((v) => isEqual(fieldValue, v));
		default:
			return false;
	}
}

function getFieldValue(field: FilterField, mail: MessageWithRelations, category?: string): unknown {
	switch (field) {
		// TODO: Might need a field for like, name, in addition to email address
		case 'from':
			return mail.senderEmail;
		case 'to':
			return mail.messageRecipients.filter((r) => r.type === 'TO').map((r) => r.email);
		case 'cc':
			return mail.messageRecipients.filter((r) => r.type === 'CC').map((r) => r.email);
		case 'bcc':
			return mail.messageRecipients.filter((r) => r.type === 'BCC').map((r) => r.email);
		case 'subject':
			return mail.subject;
		case 'body':
			return mail.contentText ?? mail.contentHtml ?? '';
		case 'date':
			return mail.sentAt;
		case 'hasAttachments':
			return mail.messageAttachments && mail.messageAttachments.length > 0;
		case 'labels':
			return mail.messageLabels.map((l) => l.label.id);
		case 'categories':
			return category ?? '';
	}
}

function isEqual(a: unknown, b: unknown): boolean {
	if (a instanceof Date && b instanceof Date) {
		return a.getTime() === b.getTime();
	}

	return a === b;
}

function isLessThan(a: unknown, b: unknown): boolean {
	if (a instanceof Date && b instanceof Date) {
		return a.getTime() < b.getTime();
	}

	if (typeof a === 'number' && typeof b === 'number') {
		return a < b;
	}

	return false;
}

function isLessThanOrEqual(a: unknown, b: unknown): boolean {
	if (a instanceof Date && b instanceof Date) {
		return a.getTime() <= b.getTime();
	}

	if (typeof a === 'number' && typeof b === 'number') {
		return a <= b;
	}

	return false;
}

function isGreaterThan(a: unknown, b: unknown): boolean {
	if (a instanceof Date && b instanceof Date) {
		return a.getTime() > b.getTime();
	}

	if (typeof a === 'number' && typeof b === 'number') {
		return a > b;
	}

	return false;
}

function isGreaterThanOrEqual(a: unknown, b: unknown): boolean {
	if (a instanceof Date && b instanceof Date) {
		return a.getTime() >= b.getTime();
	}

	if (typeof a === 'number' && typeof b === 'number') {
		return a >= b;
	}

	return false;
}

function evaluateContains(fieldValue: unknown, filterValue: unknown): boolean {
	if (Array.isArray(fieldValue) && Array.isArray(filterValue)) {
		// For array fields like labels, check if any filter values are contained in field array
		return filterValue.some((fv) => fieldValue.includes(fv));
	}

	if (typeof fieldValue === 'string' && typeof filterValue === 'string') {
		return fieldValue.toLowerCase().includes(filterValue.toLowerCase());
	}

	return false;
}
