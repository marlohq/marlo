import { AUTHENTICATION_CATEGORY } from './authentication/server.ts';
import { CALENDAR_CATEGORY } from './calendar/server.ts';
import { DELIVERY_CATEGORY } from './delivery/server.ts';
import { INVOICE_CATEGORY } from './invoice/server.ts';
import { JUNK_CATEGORY } from './junk/server.ts';
import { NEWSLETTERS_CATEGORY } from './newsletters/server.ts';
import { PROMOTIONS_CATEGORY } from './promotions/server.ts';
import { RECEIPTS_CATEGORY } from './receipts/server.ts';
import { RESERVATION_CATEGORY } from './reservation/server.ts';
import type { CategoryServerModule } from './types.ts';
import { UPDATES_CATEGORY } from './updates/server.ts';

export const DEFAULT_CATEGORIES = [
	'authentication',
	'calendar',
	'delivery',
	'invoice',
	'newsletters',
	'receipts',
	'promotions',
	'reservation',
	'junk',
	'updates',
] as const;
export const ALL_CATEGORIES = [...DEFAULT_CATEGORIES] as const; // for now all categories are default
type DefaultCategoryId = (typeof DEFAULT_CATEGORIES)[number];

export function getAllCategoryServerModules() {
	const categories = {
		newsletters: NEWSLETTERS_CATEGORY,
		receipts: RECEIPTS_CATEGORY,
		calendar: CALENDAR_CATEGORY,
		authentication: AUTHENTICATION_CATEGORY,
		delivery: DELIVERY_CATEGORY,
		invoice: INVOICE_CATEGORY,
		promotions: PROMOTIONS_CATEGORY,
		reservation: RESERVATION_CATEGORY,
		junk: JUNK_CATEGORY,
		updates: UPDATES_CATEGORY,
	} satisfies Record<DefaultCategoryId, CategoryServerModule>;
	return categories;
}

export async function getCategoryServerModule(
	categoryId: string,
): Promise<CategoryServerModule | undefined> {
	const dict: Record<string, CategoryServerModule> = getAllCategoryServerModules();
	return dict[categoryId];
}

export function defineCategoryServerModule(def: CategoryServerModule) {
	return def;
}
