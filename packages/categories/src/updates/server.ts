import { defineCategoryServerModule } from '../util.ts';

export const UPDATES_CATEGORY = defineCategoryServerModule({
	id: 'updates',
	tagging: {
		check: async ({ message }) => {
			// Hardcode some popular, noisy senders to save on API calls and speed.
			// Add more here as needed.
			if (message.senderEmail.toLowerCase() === 'notifications@github.com') {
				return true;
			}
			return false;
		},
	},
});
