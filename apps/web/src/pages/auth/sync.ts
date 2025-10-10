import { db } from '@workspace/core/drizzle.js';
import { logger } from '@workspace/core/logger.js';
import type { APIRoute } from 'astro';
import { createSyncJWT, verifyJWT } from '../../lib/auth.ts';

export const POST: APIRoute = async ({ request, cookies, locals }) => {
	try {
		// Get the session token from request body
		const body = (await request.json()) as { sessionToken?: string };
		const sessionToken = body.sessionToken;

		if (!sessionToken) {
			return new Response(
				JSON.stringify({
					success: false,
					error: 'Session token required',
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' },
				},
			);
		}

		const claims = await verifyJWT(sessionToken);
		if (claims) {
			const currentAccount =
				(await db.query.account.findFirst({
					where: (account, { eq }) => eq(account.id, claims.sub),
					with: { user: true },
				})) ?? null;

			if (!currentAccount) {
				return new Response(
					JSON.stringify({
						success: false,
						error: 'Account not found',
					}),
					{
						status: 404,
						headers: { 'Content-Type': 'application/json' },
					},
				);
			}

			const syncjwt = await createSyncJWT({
				sub: currentAccount.id,
				userId: currentAccount.userId,
				email: currentAccount.email,
			});

			return new Response(
				JSON.stringify({
					success: true,
					syncjwt,
					userStatus: currentAccount.user.status,
				}),
				{
					headers: { 'Content-Type': 'application/json' },
				},
			);
		}

		return new Response(
			JSON.stringify({
				success: false,
				error: 'Invalid session token',
			}),
			{
				status: 401,
				headers: { 'Content-Type': 'application/json' },
			},
		);
	} catch (error) {
		logger.error({ error }, 'Error creating sync JWT');
		return new Response(
			JSON.stringify({
				success: false,
				error: 'Internal server error',
			}),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' },
			},
		);
	}
};
