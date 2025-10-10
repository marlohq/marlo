import type { Message, Thread } from '@workspace/core/drizzle.js';
import type { Mail } from '@workspace/core/mail-parser.js';
import type { OAuthConfig } from '@workspace/core/oauth.js';
import type { MailReport, MaybePromise } from '@workspace/core/types.js';
import type { OAuth2Tokens } from 'arctic';
export type InputJsonObject = Record<string, unknown>;

export type CategoryId =
	| 'authentication'
	| 'calendar'
	| 'delivery'
	| 'invoice'
	| 'newsletters'
	| 'receipts'
	| 'promotions'
	| 'reservation'
	| 'junk'
	| 'updates';

export type { AuthenticationCategoryProperties } from './authentication/server.ts';
export type { CalendarCategoryProperties } from './calendar/server.ts';
export type { DeliveryCategoryProperties } from './delivery/server.ts';
export type { InvoiceCategoryProperties } from './invoice/server.ts';
export type { NewslettersCategoryProperties } from './newsletters/server.ts';
export type { ReceiptsCategoryProperties } from './receipts/server.ts';
export type { ReservationCategoryProperties } from './reservation/server.ts';

export type CheckFunction<T = MaybePromise<void>> = (args: {
	message: Message;
	thread: Thread;
	report: MailReport;
	mail: Mail;
}) => T;
export interface CategoryServerModule {
	id: string;
	oauth?: OAuthConfig;
	/** Initialize the category. Only called when the is created, or re-authorized. */
	init?: (
		tokens?: OAuth2Tokens,
		context?: {
			userId: string;
			scope: string | null;
		},
	) => MaybePromise<undefined>;
	/** Destroy the category. Only called when the is destroyed. */
	destroy?: (context?: { userId: string }) => MaybePromise<undefined>;
	/** Tagging logic */
	tagging?: {
		/** Determine if the category should tag the message. */
		check?: CheckFunction<MaybePromise<boolean>>;
		/** If tagged, run any custom logic to tag the message. */
		tag?: CheckFunction<MaybePromise<InputJsonObject>>;
	};
	/**
	 * Serialize the category state. Called on category creation and on token refresh (can be quite
	 * often).
	 */
	getInstallationState?: (
		tokens?: OAuth2Tokens,
		context?: { userId: string },
	) => MaybePromise<Record<string, string | number> | undefined>;
}
