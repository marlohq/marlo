import { extractCategoryData } from '@workspace/ai';
import { defineCategoryServerModule } from '../util.ts';

export type ReservationCategoryProperties = {
	confirmationNumber?: string;
	serviceProvider?: string;
	timeOfReservation?: string;
	location?: string;
};

export const RESERVATION_CATEGORY = defineCategoryServerModule({
	id: 'reservation',
	tagging: {
		tag: async ({ message, report }): Promise<ReservationCategoryProperties> => {
			const reservationData = await extractCategoryData.extractReservationData(message.id, report);

			// Filter out undefined values to keep the object clean
			const result: Record<string, string> = {};
			if (reservationData.confirmationNumber)
				result.confirmationNumber = reservationData.confirmationNumber;
			if (reservationData.serviceProvider) result.serviceProvider = reservationData.serviceProvider;
			if (reservationData.timeOfReservation)
				result.timeOfReservation = reservationData.timeOfReservation;
			if (reservationData.location) result.location = reservationData.location;

			return result;
		},
	},
});
