import { RiMoneyDollarCircleFill } from '@remixicon/react';
import type { CategoryClientModule } from '../../lib/categories.ts';
import { formatCurrency } from '../../lib/util.ts';
import type { ClientThread } from '../../threads/model.ts';

export const receipts: CategoryClientModule = {
	id: 'receipts',
	name: 'Receipts',
	color: '#00c951',
	description: 'Track and download receipts for all of your purchases.',
	icon: RiMoneyDollarCircleFill,
	getBadgeContents(thread: ClientThread) {
		const receiptData = thread.getCategoryProperties('receipts');
		const currency = receiptData.currency;
		const total = receiptData.total;
		if (!currency || !total) {
			return <receipts.icon className="size-3.5 shrink-0" />;
		}
		return (
			<>
				<receipts.icon className="size-3.5 shrink-0" />
				<span className="min-w-0">{formatCurrency(total, currency)}</span>
			</>
		);
	},
};
