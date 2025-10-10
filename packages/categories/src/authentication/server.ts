import { extractCategoryData } from '@workspace/ai';
import { defineCategoryServerModule } from '../util.ts';

export type AuthenticationCategoryProperties = {
	verificationType?: string;
	code?: string;
	link?: string;
	linkText?: string;
};

export const AUTHENTICATION_CATEGORY = defineCategoryServerModule({
	id: 'authentication',
	tagging: {
		tag: async ({ message, report }): Promise<AuthenticationCategoryProperties> => {
			const authData = await extractCategoryData.extractAuthenticationData(message.id, report);

			// Filter out undefined values to keep the object clean
			const result: Record<string, string> = {};
			if (authData.verificationType) result.verificationType = authData.verificationType;
			if (authData.code) result.code = authData.code;
			if (authData.link) result.link = authData.link;
			if (authData.linkText) result.linkText = authData.linkText;

			return result;
		},
	},
});
