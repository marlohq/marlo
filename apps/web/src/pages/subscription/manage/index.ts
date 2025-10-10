import type { APIContext } from 'astro';
import { getCurrentAccountOrThrow } from '../../../lib/auth.ts';
import { createBillingPortalSession } from '../../../lib/stripe.ts';

export async function GET({ url, locals }: APIContext) {
	const account = await getCurrentAccountOrThrow({ locals });
	return createBillingPortalSession(account, url);
}
