import type { MailHeaders } from '@workspace/core/mail-parser.js';
import { defineCategoryServerModule } from '../util.ts';

function parseMailingListEmail(headers: MailHeaders): string | undefined {
	const listId = headers['list-id'] as string | undefined;
	if (!listId) return undefined;

	// Format: "newsletter-name <newsletter-email@example.com>"
	// We throw away the name, since it may be an ID and not a human-readable name
	// common for mcsv.net newsletters sent by Mailchimp
	return listId.match(/<([^>]+)>/)?.[1];
}

export const PROMOTIONS_CATEGORY = defineCategoryServerModule({
	id: 'promotions',
	tagging: {
		tag: async ({ message, mail }) => {
			const listId = parseMailingListEmail(mail.headers);

			return {
				listId,
			};
		},
	},
});
