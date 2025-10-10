import type { Mail, MailAttachement } from '@workspace/core/mail-parser.js';
import { defineCategoryServerModule } from '../util.ts';

function getIcsAttachment(mail: Mail): MailAttachement | undefined {
	return mail.attachments?.find((a) => a.contentType === 'application/ics');
}

export type CalendarCategoryProperties = {
	kind?: 'invitation' | 'notification';
	priority?: boolean;
};

export const CALENDAR_CATEGORY = defineCategoryServerModule({
	id: 'calendar',
	tagging: {
		check: ({ mail }) => {
			if (!mail.messageId || !mail.messageId.startsWith('<calendar-')) {
				return false;
			}
			if (!getIcsAttachment(mail)) {
				return false;
			}
			return true;
		},
		tag: ({ message, report }): CalendarCategoryProperties => {
			const subject = message.subject;
			if (subject.startsWith('Invitation:') || subject.startsWith('Updated Invitation:')) {
				return { kind: 'invitation', priority: true };
			} else {
				return { kind: 'notification' };
			}
		},
	},
});
