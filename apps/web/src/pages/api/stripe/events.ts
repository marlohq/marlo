import { db, eq, user } from '@workspace/core/drizzle.js';
import { captureException } from '@workspace/core/instrument.ts';
import { logger as baseLogger } from '@workspace/core/logger.js';
import type { APIContext } from 'astro';
import { invariant } from 'es-toolkit';
import type Stripe from 'stripe';
import { STRIPE_SIGNING_SECRET } from '../../../env.ts';
import { stripe } from '../../../lib/stripe.ts';

const logger = baseLogger.child({
	namespace: 'stripe:events',
});

const TRACKED_EVENTS: Stripe.Event.Type[] = [
	'checkout.session.completed',
	'checkout.session.async_payment_succeeded',
	'customer.subscription.created',
	'customer.subscription.updated',
	'customer.subscription.deleted',
	'customer.subscription.paused',
	'customer.subscription.resumed',
	'customer.subscription.pending_update_applied',
	'customer.subscription.pending_update_expired',
	'customer.subscription.trial_will_end',
	'invoice.paid',
	'invoice.payment_failed',
	'invoice.payment_action_required',
	'invoice.upcoming',
	'invoice.marked_uncollectible',
	'invoice.payment_succeeded',
	'payment_intent.succeeded',
	'payment_intent.payment_failed',
	'payment_intent.canceled',
	'setup_intent.succeeded',
];

export type StripeNoSubscription = {
	status: 'card_on_file';
};

export type StripeDeletedCustomer = {
	status: 'deleted';
};

export type StripeSubscriptionData = {
	subscriptionId: string | null;
	status: Stripe.Subscription.Status;
	priceId: string | null;
	currentPeriodStart: number | null;
	currentPeriodEnd: number | null;
	cancelAtPeriodEnd: boolean;
	paymentMethod: {
		brand: string | null; // e.g., "visa", "mastercard"
		last4: string | null; // e.g., "4242"
	} | null;
};

export async function POST({ request }: APIContext) {
	try {
		return await handleRequest(request);
	} catch (error) {
		captureException({ error }, 'Stripe event error');
		return new Response('Error', { status: 500 });
	}
}

async function handleRequest(request: Request) {
	const requestBody = await request.text();
	const signature = request.headers.get('stripe-signature');
	if (!signature) {
		return new Response('No signature', { status: 400 });
	}
	invariant(STRIPE_SIGNING_SECRET, 'STRIPE_SIGNING_SECRET is required for webhook verification');
	invariant(stripe, 'Stripe is not configured');
	const event = stripe.webhooks.constructEvent(requestBody, signature, STRIPE_SIGNING_SECRET);
	logger.info({ event: event.type }, 'Stripe event received');

	// Skip processing if the event isn't one I'm tracking (list of all events below)
	if (!TRACKED_EVENTS.includes(event.type)) {
		return new Response('Event not tracked', { status: 200 });
	}

	// All the events we track have a customerId
	// Sadly TypeScript does not know this
	const { customer: customerId } = event?.data?.object as { customer: string };

	// This helps make it typesafe and also lets me know if my assumption is wrong
	invariant(
		typeof customerId === 'string',
		`[STRIPE HOOK] customerId is not a string.\nEvent type: ${event.type}`,
	);

	const subscriptionData = await getSubscriptionData(customerId);
	await db
		.update(user)
		.set({
			status:
				subscriptionData?.status === 'card_on_file'
					? 'INACTIVE'
					: subscriptionData?.status === 'active' || subscriptionData?.status === 'trialing'
						? 'ACTIVE'
						: 'INACTIVE',
			subscriptionData: subscriptionData ? subscriptionData : null,
		})
		.where(eq(user.stripeCustomerId, customerId));
	return new Response('OK', { status: 200 });
}

// The contents of this function should probably be wrapped in a try/catch
export async function getSubscriptionData(
	customerId: string,
): Promise<StripeSubscriptionData | StripeNoSubscription | StripeDeletedCustomer | null> {
	invariant(stripe, 'Stripe is not configured');
	// Fetch latest subscription data from Stripe
	const subscriptions = await stripe.subscriptions.list({
		customer: customerId,
		limit: 1,
		status: 'all',
		expand: ['data.default_payment_method'],
	});
	const subscription = subscriptions.data[0];

	// If the user has no subscriptions, we need to check if they have a default payment method.
	// This is a meaningful status for us, because it means the user has a payment method on file.
	// NOTE: We intentionally don't combine this into a single Stripe API call, because this event
	// is extremely rare and only related to onboarding, compared to the other very noisy event types.
	if (!subscription) {
		const paymentMethods = await stripe.customers.listPaymentMethods(customerId, { limit: 1 });
		if (paymentMethods.data.length > 0) {
			return {
				status: 'card_on_file',
			};
		}
		return null;
	}

	return {
		subscriptionId: subscription.id,
		status: subscription.status,
		priceId: subscription.items.data[0]?.price.id ?? null,
		currentPeriodEnd: subscription.items.data[0]?.current_period_end ?? null,
		currentPeriodStart: subscription.items.data[0]?.current_period_start ?? null,
		cancelAtPeriodEnd: subscription.cancel_at_period_end,
		paymentMethod:
			subscription.default_payment_method && typeof subscription.default_payment_method !== 'string'
				? {
						brand: subscription.default_payment_method.card?.brand ?? null,
						last4: subscription.default_payment_method.card?.last4 ?? null,
					}
				: null,
	} as StripeSubscriptionData;
}
