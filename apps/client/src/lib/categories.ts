import type { CategoryId } from '@workspace/categories/types.js';
import { invariant } from 'es-toolkit';
import type { ComponentType } from 'react';
import { authentication } from '../categories/authentication/client.tsx';
import { calendar } from '../categories/calendar/client.tsx';
import { delivery } from '../categories/delivery/client.tsx';
import { invoice } from '../categories/invoice/client.tsx';
import { junk } from '../categories/junk/client.tsx';
import { newsletters } from '../categories/newsletters/client.tsx';
import { promotions } from '../categories/promotions/client.tsx';
import { receipts } from '../categories/receipts/client.tsx';
import { reservation } from '../categories/reservation/client.tsx';
import { updates } from '../categories/updates/client.tsx';
import type { ClientThread } from '../threads/model.ts';

interface ThreadProps {
	icon: CategoryId;
	title: string;
	description: string;
	href?: string;
	linkText?: string;
	updatedAt: string;
	complete?: boolean | undefined;
	author?: string | null;
	labels: { name: string; id: string; visible: boolean }[];
	from?: string;
}

export interface CategoryClientModule {
	id: CategoryId;
	name: string;
	description: string;
	icon: ComponentType<{ className?: string; style?: React.CSSProperties }>;
	color?: string;
	getBadgeContents?: (thread: ClientThread) => React.ReactNode;
}

const CLIENT_CATEGORIES: Record<CategoryId, CategoryClientModule> = {
	newsletters,
	receipts,
	promotions,
	calendar,
	authentication,
	delivery,
	invoice,
	reservation,
	junk,
	updates,
};

export function listCategoryClientModules() {
	return Object.keys(CLIENT_CATEGORIES).map(getCategoryClientModule);
}

export function getCategoryClientModule(id: string) {
	const category = CLIENT_CATEGORIES[id as CategoryId];
	invariant(category, `Client category ${id} not found`);
	return category;
}
