import { type Account, and, db, eq, message, messageAttachment } from '@workspace/core/drizzle.js';
import { createAttachmentHash, getAttachmentResult } from '@workspace/core/storage/attachments.ts';
import type { APIRoute } from 'astro';
import { invariant } from 'es-toolkit';
import { getCurrentAccount } from '../../../lib/auth.ts';

export const GET: APIRoute = async (context) => {
	const currentAccount = await getCurrentAccount(context);
	if (!currentAccount) {
		return new Response(null, {
			status: 401,
			statusText: 'Unauthorized',
		});
	}

	const { messageId } = context.params;
	if (!messageId) {
		return new Response(null, {
			status: 400,
			statusText: 'Bad request',
		});
	}

	const searchParams = context.url.searchParams;
	const cid = searchParams.get('cid');
	if (!cid) {
		return new Response(null, {
			status: 400,
			statusText: 'Bad request',
		});
	}

	// This verifies that the message exists and that the user has access to it.
	const attachment = await queryMessageAttachment(currentAccount, `<${cid}>`);

	if (!attachment?.contentId) {
		return new Response(null, {
			status: 404,
			statusText: 'Not found',
		});
	}

	try {
		const hash = createAttachmentHash(
			currentAccount.userId,
			attachment.message.remoteId,
			attachment.contentId,
		);

		const result = await getAttachmentResult(currentAccount.id, hash);
		invariant(result.Body, 'getAttachmentResult body not found');
		const stream = result.Body.transformToWebStream();
		const headers = new Headers();
		const contentType = result.ContentType;
		if (contentType) {
			headers.set('Content-Type', contentType);
		}
		const contentLength = result.ContentLength;
		if (contentLength) {
			headers.set('Content-Length', contentLength.toString());
		}

		return new Response(stream as BodyInit, {
			status: 200,
		});
	} catch (error) {
		return new Response(null, {
			status: 404,
			statusText: 'Not found',
		});
	}
};

async function queryMessageAttachment(currentAccount: Account, contentId: string) {
	return await db
		.select({
			contentId: messageAttachment.contentId,
			message: {
				remoteId: message.remoteId,
			},
		})
		.from(messageAttachment)
		.innerJoin(message, eq(messageAttachment.messageId, message.id))
		.where(
			and(eq(messageAttachment.contentId, contentId), eq(message.accountId, currentAccount.id)),
		)
		.limit(1)
		.then((rows) => rows[0] || null);
}
