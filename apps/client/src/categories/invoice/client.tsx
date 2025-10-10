import { RiFileTextFill } from '@remixicon/react';
import type { CategoryClientModule } from '../../lib/categories.ts';
import { formatCurrency } from '../../lib/util.ts';
import type { ClientThread } from '../../threads/model.ts';

export const invoice: CategoryClientModule = {
	id: 'invoice',
	name: 'Invoice',
	color: '#dc2626',
	description: 'Track bills, invoices, and payment due dates.',
	icon: RiFileTextFill,
	getBadgeContents(thread: ClientThread) {
		const invoiceData = thread.getCategoryProperties('invoice');
		const amountDue = invoiceData?.amountDue;
		const amountCurrency = invoiceData?.amountCurrency;

		if (!amountDue || !amountCurrency) {
			return <invoice.icon className="size-3.5 shrink-0" />;
		}

		return (
			<>
				<invoice.icon className="size-3.5 shrink-0" />
				<span className="min-w-0 truncate">{formatCurrency(amountDue, amountCurrency)}</span>
			</>
		);
	},
};
