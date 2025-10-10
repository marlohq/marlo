import { type Account, db } from '@workspace/core/drizzle.js';
import { captureException } from '@workspace/core/instrument.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import { invariant } from 'es-toolkit';
import Stripe from 'stripe';
import { FEATURE_STRIPE_ENABLED, STRIPE_DEFAULT_PRICE_ID, STRIPE_SECRET_KEY } from '../env.ts';

export const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

const logger = baseLogger.child({
	namespace: 'web:stripe',
});

export async function createSetupCheckoutSession(
	account: Account,
	currentURL: URL,
): Promise<string> {
	invariant(stripe, 'Stripe is not configured');

	const userRecord = await db.query.user.findFirst({
		where: (user, { eq }) => eq(user.id, account.userId),
	});
	invariant(userRecord, 'User not found');

	const successURL = new URL('?stripe=true&success=true', currentURL);
	const cancelURL = new URL('?stripe=true&success=false', currentURL);

	logger.info(
		{ userId: userRecord.id, successURL: successURL.toString(), cancelURL: cancelURL.toString() },
		'Creating Stripe subscription checkout session',
	);

	const session = await stripe.checkout.sessions.create({
		mode: 'subscription',
		line_items: [
			{
				price: STRIPE_DEFAULT_PRICE_ID,
				quantity: 1,
			},
		],
		allow_promotion_codes: true,
		success_url: successURL.toString(),
		cancel_url: cancelURL.toString(),
		client_reference_id: account.userId,
		customer: userRecord.stripeCustomerId,
	});

	logger.info(
		{ userId: userRecord.id, sessionId: session.id, sessionURL: session.url },
		'Stripe subscription checkout session created',
	);
	invariant(session.url, 'No URL returned from Stripe');
	return session.url;
}

export async function createBillingPortalSession(account: Account, currentURL: URL) {
	invariant(stripe, 'Stripe is not configured');

	const user = await db.query.user.findFirst({
		where: (user, { eq }) => eq(user.id, account.userId),
	});
	invariant(user, 'User not found');
	logger.info({ userId: user.id }, 'Creating Stripe billing portal session');

	const session = await stripe.billingPortal.sessions.create({
		customer: user.stripeCustomerId,
		return_url: new URL('/', currentURL).toString(),
	});
	return new Response(null, {
		status: 302,
		headers: {
			Location: session.url,
		},
	});
}

export async function getCheckoutSession(sessionId: string) {
	if (!stripe) {
		return {
			session: null,
			customer: null,
		};
	}
	const session = await stripe.checkout.sessions.retrieve(sessionId);
	if (!session) {
		return {
			session: null,
			customer: null,
		};
	}
	const customerId = getCustomerId(session.customer);
	if (!customerId) {
		return {
			session: null,
			customer: null,
		};
	}
	const customer = await stripe.customers.retrieve(customerId);
	return {
		session,
		customer,
	};
}

export async function createStripeCustomer(email: string) {
	if (!FEATURE_STRIPE_ENABLED || !stripe) {
		// Return a placeholder customer ID when Stripe is disabled
		return 'stripe_disabled';
	}
	const result = await stripe.customers.create({ email });
	return result.id;
}

export async function subscribeToPlan(customerId: string, priceLookupKey: string) {
	invariant(stripe, 'Stripe is not configured');

	const standardPrice = await stripe.prices.list({
		lookup_keys: [priceLookupKey],
	});
	const priceId = standardPrice.data[0]?.id;
	if (!priceId) {
		throw new Error('No standard price found');
	}
	const subscription = await stripe.subscriptions.create({
		customer: customerId,
		items: [{ price: priceId }],
	});
	return subscription.id;
}

function getCustomerId(
	customer: Stripe.Subscription['customer'] | Stripe.Invoice['customer'],
): string | null {
	if (typeof customer === 'string') {
		return customer;
	}
	if (!customer) {
		return null;
	}
	return customer.id;
}

function getCustomerIdOrThrow(
	customer: Stripe.Subscription['customer'] | Stripe.Invoice['customer'],
): string {
	const id = getCustomerId(customer);
	if (!id) {
		captureException({ customer: id }, 'No customer found');
		throw new Error('No customer found');
	}
	return id;
}
