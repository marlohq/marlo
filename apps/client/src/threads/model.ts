import type {
	AuthenticationCategoryProperties,
	CalendarCategoryProperties,
	CategoryId,
	DeliveryCategoryProperties,
	InvoiceCategoryProperties,
	NewslettersCategoryProperties,
	ReceiptsCategoryProperties,
	ReservationCategoryProperties,
} from '@workspace/categories/types.js';
import type { EmptyObject } from '@workspace/core/types.js';
import type { MessageData, ThreadData } from '@workspace/sync-data/data.ts';

type CategoryPropsMap = {
	authentication: AuthenticationCategoryProperties;
	calendar: CalendarCategoryProperties;
	delivery: DeliveryCategoryProperties;
	invoice: InvoiceCategoryProperties;
	newsletters: NewslettersCategoryProperties;
	promotions: EmptyObject;
	receipts: ReceiptsCategoryProperties;
	reservation: ReservationCategoryProperties;
	junk: EmptyObject;
	updates: EmptyObject;
};

import { invariant } from 'es-toolkit';
import { htmlUnescape } from 'escape-goat';

export class ClientThread {
	data: ThreadData;

	constructor(thread: ThreadData) {
		this.data = thread;
	}

	get id() {
		return this.data.id;
	}

	get remoteId() {
		return this.data.remoteId;
	}

	// TODO(fks): Should the thread store its own subject? Then each message could save it's "Re: Re: Re: "
	// true subject in the database, instead of formatting it before insert into the database.
	get subject() {
		return htmlUnescape(this.data.messages.at(0)?.subject ?? 'No subject');
	}

	get snippet() {
		return (
			this.data.messages.at(-1)?.snippet ??
			htmlUnescape(this.data.messages.at(-1)?.contentText?.slice(0, 100) ?? '') ?? // TODO: Remove this fallback once every message has a snippet
			'No summary available'
		);
	}

	get trashedAt() {
		return this.data.trashedAt && new Date(this.data.trashedAt);
	}

	get spammedAt() {
		return this.data.spammedAt && new Date(this.data.spammedAt);
	}

	get resolvedAt() {
		return this.data.resolvedAt && new Date(this.data.resolvedAt);
	}

	get lastSentAt() {
		return new Date(this.data.lastSentAt);
	}

	get triagedAt() {
		return this.data.triagedAt && new Date(this.data.triagedAt);
	}

	get markedSafeAt() {
		return this.data.markedSafeAt && new Date(this.data.markedSafeAt);
	}

	get starredAt() {
		return this.data.starredAt && new Date(this.data.starredAt);
	}

	href(userEmail: string) {
		return `https://mail.google.com/mail/?authuser=${encodeURIComponent(userEmail)}#all/${this.data.remoteId}`;
	}

	get read() {
		return getReadStatus(this.data);
	}

	get messages() {
		invariant(this.data.messages[0], 'ClientThread: unexpected empty thread.messages');
		return this.data.messages as [MessageData, ...MessageData[]];
	}

	get labels() {
		invariant(this.data.messages[0], 'ClientThread: unexpected empty thread.messages');
		return this.data.messages[0].messageLabels;
	}

	get category() {
		return this.data.category ?? null;
	}

	private getCategoryPropertiesObject() {
		const list = this.data.categoryProperties ?? [];
		const map: Record<string, unknown> = {};
		for (const item of list) {
			map[item.key] = item.value;
		}
		return map;
	}

	getCategoryProperties<T extends CategoryId>(expected: T): CategoryPropsMap[T] {
		invariant(this.category === expected, `Expected category ${expected}, got ${this.category}`);
		const result = this.getCategoryPropertiesObject() as CategoryPropsMap[T];
		invariant(result, `Expected category properties to exist, got ${result}`);
		return result;
	}

	//

	get spaceId() {
		return this.data.spaceId ?? null;
	}

	get spaceProperties() {
		const list = this.data.spaceProperties ?? [];
		const map: Record<string, unknown> = {};
		for (const item of list) {
			map[item.key] = item.value;
		}
		return map;
	}

	get spacePropertyList() {
		return this.data.spaceProperties ?? [];
	}

	get userId() {
		return this.data.userId;
	}

	get unsent() {
		return isUnsentThread(this.data);
	}

	hasDrafts() {
		return this.data.messages.some((message) => message.draftId !== null && !message.deletedAt);
	}

	onlyHasDrafts() {
		return this.data.messages.every((message) => message.draftId !== null);
	}
}

function getReadStatus(thread: ThreadData) {
	const messages = thread.messages.filter((message) => !message.deletedAt);
	// If every message has a read date then it's read
	const isRead = messages.length > 0 && messages.every((message) => !!message.readAt);
	return isRead;
}

/**
 * Note: UNSENT in our system refers to a thread that has been sent by the client but not yet picked
 * up by the server. This is often during the period where the user has hit "SEND" but the server is
 * waiting for the undo grace period to end before sending.
 */
export function isUnsentThread(thread: ThreadData) {
	if (thread.remoteId.startsWith('ZZ')) {
		return true;
	}
	// Check that no message has a remoteId that starts with ZZ,
	// UNLESS it has a draftId, which means it's a draft and not unsent.
	if (thread.messages.some((message) => !message.draftId && message.remoteId.startsWith('ZZ'))) {
		return true;
	}
	return false;
}
