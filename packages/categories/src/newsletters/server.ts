import { extractCategoryData } from '@workspace/ai';
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

export type NewslettersCategoryProperties = {
	listId?: string;
	newsletterName?: string;
};

export const NEWSLETTERS_CATEGORY = defineCategoryServerModule({
	id: 'newsletters',
	tagging: {
		tag: async ({ message, report, mail }): Promise<NewslettersCategoryProperties> => {
			const listId = parseMailingListEmail(mail.headers);
			const data = await extractCategoryData.extractNewsletterData(message.id, report);
			return {
				listId,
				newsletterName: data.newsletterName,
			};
		},
	},
});
