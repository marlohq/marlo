import { extractCategoryData } from '@workspace/ai';
import { defineCategoryServerModule } from '../util.ts';

export type ReceiptsCategoryProperties = {
	total?: number;
	currency?: string;
};

export const RECEIPTS_CATEGORY = defineCategoryServerModule({
	id: 'receipts',
	tagging: {
		tag: async ({ message, report }): Promise<ReceiptsCategoryProperties> => {
			const receiptData = await extractCategoryData.extractReceiptData(message.id, report);
			if (receiptData.totalAmount === 0) {
				return {};
			}

			return {
				total: receiptData.totalAmount,
				currency: receiptData.totalAmountCurrency,
			};
		},
	},
});
