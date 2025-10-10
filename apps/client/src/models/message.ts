import type { MessageData } from '@workspace/sync-data/data.js';
import type { ClientThread } from '../threads/model.ts';

export class ClientMessage {
	constructor(
		public readonly thread: ClientThread,
		public readonly data: MessageData,
	) {}

	replyDraftMessages() {
		const globalId = this.data.globalId;
		if (!globalId) {
			return [];
		}
		const thread = this.thread.data;
		const draftMessages = thread.messages.filter((m) => m.draftId && !m.deletedAt);
		return draftMessages.filter((m) => m.inReplyTo === globalId);
	}

	hasReplyDraft() {
		return this.replyDraftMessages().length > 0;
	}
}
