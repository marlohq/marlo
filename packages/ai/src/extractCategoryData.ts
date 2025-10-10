import { logger as baseLogger } from '@workspace/core/logger.js';
import type { MailReport } from '@workspace/core/types.ts';
import { generateObject } from 'ai';
import { z } from 'zod';
import { MODELS } from './util.ts';

const logger = baseLogger.child({ namespace: 'ai' });

// biome-ignore lint/suspicious/noExplicitAny: Needed here to extend the z.Schema type
export function getDataExtractor<T extends z.Schema<any>>(categoryId: string, schema: T) {
	const timer = performance.now();
	return async (messageId: string, report: MailReport): Promise<z.infer<T>> => {
		const response = await generateObject({
			model: MODELS['gemini-2.0-flash'],
			schema,
			output: 'object',
			system: `Extract the defined ${categoryId} metadata from the following email. Do not hallucinate, only return data that is explicitly provided in the email.`,
			prompt: report,
		});
		logger.debug(
			{
				messageId,
				duration: performance.now() - timer,
				usage: response.usage,
			},
			`${categoryId} data extraction`,
		);
		return response.object;
	};
}

export const extractNewsletterData = getDataExtractor(
	'newsletter',
	z.object({
		newsletterName: z
			.string()
			.describe(
				'The name of the recurring newsletter series (not just this edition); e.g., "JavaScript Weekly", not "Issue 123: JavaScript Weekly".',
			),
	}),
);

export const extractReceiptData = getDataExtractor(
	'receipt',
	z.object({
		totalAmount: z
			.number()
			.optional()
			.describe(
				[
					'The total receipt amount in cents.',
					'Examples: $8.53 → 853; $1 → 100; $0.99 → 99; $1,234.56 → 123456.',
					'IMPORTANT: Do not mistakenly return dollar amounts as cents. For example, $100 must be returned as 10000 (not 100).',
				].join(' '),
			),
		totalAmountCurrency: z
			.string()
			.optional()
			.describe(
				'The currency of the total amount. Formatted as an ISO 4217 Currency Code (e.g. "USD", "EUR", "RUR").',
			),
	}),
);

export const extractDeliveryData = getDataExtractor(
	'delivery',
	z.object({
		parcelCarrier: z
			.string()
			.optional()
			.describe(
				'The shipping company short-name (e.g., "UPS", "FedEx", "USPS", "DHL"), if provided.',
			),
		parcelTrackingNumber: z.string().optional(),
		parcelOrderId: z.string().optional(),
		deliveryStatus: z
			.enum([
				'IN_TRANSIT',
				'OUT_FOR_DELIVERY',
				'DELIVERED',
				'DELAYED',
				'CANCELLED',
				'RETURNED',
				'UNKNOWN',
			])
			.optional(),
		expectedDeliveryDate: z
			.string()
			.optional()
			.describe('The expected delivery date, if provided. Format as ISO date string (YYYY-MM-DD).'),
	}),
);

export const extractInvoiceData = getDataExtractor(
	'invoice',
	z.object({
		invoiceId: z
			.string()
			.optional()
			.describe('The unique invoice ID or number (e.g., "INV-2024-001"), if provided.'),
		amountDue: z
			.number()
			.optional()
			.describe('The amount due in integer cents (e.g. 125000 for $1,250.00).'),
		amountCurrency: z
			.string()
			.optional()
			.describe(
				'The currency of the amount due. Formatted as an ISO 4217 Currency Code (e.g. "USD", "EUR").',
			),
		dateDue: z
			.string()
			.optional()
			.describe('The payment due date, if provided. Format as ISO date string (YYYY-MM-DD).'),
		serviceProvider: z
			.string()
			.optional()
			.describe('The name of the service provider or company issuing the invoice.'),
	}),
);

export const extractReservationData = getDataExtractor(
	'reservation',
	z.object({
		confirmationNumber: z
			.string()
			.optional()
			.describe('The reservation or confirmation number, if provided.'),
		serviceProvider: z
			.string()
			.optional()
			.describe(
				'The service provider name (e.g., "American Airlines", "The Blue Bistro", "Marriott Hotel").',
			),
		timeOfReservation: z
			.string()
			.optional()
			.describe(
				'The date and time of the reservation, if provided. Format as ISO date string (YYYY-MM-DD) or ISO datetime string (YYYY-MM-DDTHH:mm:ss).',
			),
		location: z
			.string()
			.optional()
			.describe('The location or venue name where the reservation is for.'),
	}),
);

export const extractAuthenticationData = getDataExtractor(
	'authentication',
	z.object({
		verificationType: z
			.enum([
				'2FA',
				'PASSWORDLESS_LOGIN',
				'PASSWORD_RESET',
				'LOGIN_NOTIFICATION',
				'OTHER_SECURITY_ALERT',
				'UNKNOWN',
			])
			.optional()
			.describe('The type of authentication verification being performed.'),
		code: z
			.string()
			.optional()
			.describe(
				[
					'The primary one-time code/passcode to complete the verificationType action, if present.',
					'Prefer the code that is most relevant to the detected verificationType (e.g., for 2FA choose the 2FA code; for password reset choose the reset code).',
					'Return the code as a contiguous string (e.g., "1049" or "A1B2C3" or "c6628b96-dd2b-4c8f-ace9-67fc4a12307b").',
				].join(' '),
			),
		link: z
			.string()
			.optional()
			.describe(
				[
					'The primary verification or sign-in URL to complete the verificationType action, if present.',
					'Prefer the single, most relevant link for the detected verificationType (e.g., magic sign-in link for passwordless login, password reset link for password reset).',
					'Exclude unsubscribe, help/FAQ, privacy policy, image tracking, and anything other URL that does not directly complete the verificationType action.',
					'This must be a valid URL, including the protocol (e.g., "https://") EXACTLY as it appears in the email HTML.',
				].join(' '),
			),
		linkText: z
			.string()
			.optional()
			.describe(
				[
					'The display text of the primary verification or sign-in URL to complete the verificationType action, if present.',
					'This must be human-readable text (e.g., "Sign in", "Reset Password", etc.) and it must be DIRECTLY associated with the returned "link" URL. Do not change or shorten the text.',
					'If text matching this description is not present, do not return anything.',
				].join(' '),
			),
	}),
);
