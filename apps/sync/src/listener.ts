import { db } from '@workspace/core/drizzle.js';
import { connectionHub } from './connections.js';
import type { Channel } from './db-connection.js';

interface NotificationData {
	payload: string;
}

export async function onNotification(data: NotificationData, channel: Channel) {
	const id = data.payload;
	switch (channel) {
		case 'thread': {
			const thread = await db.query.thread.findFirst({
				where: (thread, { eq }) => eq(thread.id, id),
				columns: { accountId: true },
			});
			if (thread) {
				connectionHub.queuePoke(thread.accountId);
			}
			break;
		}
		case 'account': {
			connectionHub.queuePoke(id);
			break;
		}
		case 'label': {
			const label = await db.query.label.findFirst({
				where: (label, { eq }) => eq(label.id, id),
				columns: { accountId: true },
			});
			if (label) {
				connectionHub.queuePoke(label.accountId);
			}
			break;
		}
		case 'draft': {
			const draft = await db.query.draft.findFirst({
				where: (draft, { eq }) => eq(draft.id, id),
				columns: { accountId: true },
			});
			if (draft) {
				connectionHub.queuePoke(draft.accountId);
			}
			break;
		}
		case 'contact': {
			const contact = await db.query.contact.findFirst({
				where: (contact, { eq }) => eq(contact.id, id),
				columns: { accountId: true },
			});
			if (contact) {
				connectionHub.queuePoke(contact.accountId);
			}
			break;
		}
		case 'signature': {
			const signature = await db.query.signature.findFirst({
				where: (signature, { eq }) => eq(signature.id, id),
				columns: { accountId: true },
			});
			if (signature) {
				connectionHub.queuePoke(signature.accountId);
			}
			break;
		}
		default: {
			unreachable(channel);
		}
	}
}

function unreachable(value: never): never {
	throw new Error(`Unreachable code: ${value}`);
}
