import { db } from '@workspace/core/drizzle.js';
import { logger } from '@workspace/core/logger.js';
import { invariant } from 'es-toolkit';
import { GoogleRateLimitError } from '../errors.ts';
import { isGaxiosError } from '../request-client.ts';
import { consumeMessage } from './ingest.ts';

export async function consumeMessageImport(
	accountId: string,
	remoteMessageId: string,
	jobPriority?: number,
) {
	const t0 = performance.now();

	const account = await db.query.account.findFirst({
		where: (account, { eq }) => eq(account.id, accountId),
	});
	invariant(account, 'Account not found');

	if (account.status !== 'ACTIVE') {
		// Google auth was down, so we can try again later.
		if (account.errorCode === 'internal_failure') {
			throw new Error(`Google auth encountered an error, retrying later`);
		}

		logger.warn(
			{
				accountId: account.id,
				errorCode: account.errorCode,
			},
			'Account is not active, skipping message import',
		);

		return;
	}

	const message = await consumeMessage(account, remoteMessageId).catch((error) => {
		logger.warn({ error, remoteMessageId: remoteMessageId }, 'Error consuming message');

		// Handle Google rate limiting
		// TODO: Figure out a better way to check for the error, the types are not great.
		if (isGaxiosError(error) && error.message.includes('Quota exceeded for quota metric')) {
			throw new GoogleRateLimitError('Google rate limit exceeded', account.id, account.userId);
		}

		// Handle 404 -- The message was likely deleted, so safe to just skip it.
		// Gmail also sometimes return message ids from temporary messages that are not valid anymore.
		// In general, 404s should be safe to ignore.
		if (isGaxiosError(error) && error.status === 404) {
			return null;
		}

		throw error;
	});

	logger.debug(
		{
			duration: performance.now() - t0,
			remoteMessageId: remoteMessageId,
			priority: jobPriority,
		},
		'Message order processed',
	);

	return message;
}
