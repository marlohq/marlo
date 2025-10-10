import { extractCategoryData } from '@workspace/ai';
import { defineCategoryServerModule } from '../util.ts';

export type InvoiceCategoryProperties = {
	invoiceId?: string;
	amountDue?: number;
	amountCurrency?: string;
	dateDue?: string;
	serviceProvider?: string;
};

export const INVOICE_CATEGORY = defineCategoryServerModule({
	id: 'invoice',
	tagging: {
		tag: async ({ message, report }): Promise<InvoiceCategoryProperties> => {
			const invoiceData = await extractCategoryData.extractInvoiceData(message.id, report);

			return {
				invoiceId: invoiceData.invoiceId,
				amountDue: invoiceData.amountDue,
				amountCurrency: invoiceData.amountCurrency,
				dateDue: invoiceData.dateDue,
				serviceProvider: invoiceData.serviceProvider,
			};
		},
	},
});
