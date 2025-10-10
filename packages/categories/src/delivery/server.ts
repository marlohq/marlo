import { extractCategoryData } from '@workspace/ai';
import { defineCategoryServerModule } from '../util.ts';

export type DeliveryCategoryProperties = {
	carrier?: string;
	trackingNumber?: string;
	orderNumber?: string;
	deliveryStatus?: string;
	expectedDeliveryDate?: string;
};

export const DELIVERY_CATEGORY = defineCategoryServerModule({
	id: 'delivery',
	tagging: {
		tag: async ({ message, report }): Promise<DeliveryCategoryProperties> => {
			const deliveryData = await extractCategoryData.extractDeliveryData(message.id, report);
			return {
				carrier: deliveryData.parcelCarrier,
				trackingNumber: deliveryData.parcelTrackingNumber,
				orderNumber: deliveryData.parcelOrderId,
				deliveryStatus: deliveryData.deliveryStatus,
				expectedDeliveryDate: deliveryData.expectedDeliveryDate,
			};
		},
	},
});
