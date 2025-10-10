import { and, db, eq, message, messageAttachment } from '@workspace/core/drizzle.js';
import { getAttachmentResult } from '@workspace/core/storage/attachments.js';
import type { APIRoute } from 'astro';
import { invariant } from 'es-toolkit';

export const GET: APIRoute = async (context) => {
	const { hash } = context.params;
	if (!hash) {
		return new Response(null, {
			status: 400,
			statusText: 'Bad request',
		});
	}

	const currentAccount = await context.locals.currentAccount();
	if (!currentAccount) {
		return new Response(null, {
			status: 401,
			statusText: 'Unauthorized',
		});
	}

	// Look up original filename. Also, confirm that the current account has access to the attachment.
	const attachmentData = await db
		.select({ filename: messageAttachment.filename })
		.from(messageAttachment)
		.innerJoin(message, eq(messageAttachment.messageId, message.id))
		.where(and(eq(messageAttachment.hash, hash), eq(message.accountId, currentAccount.id)))
		.limit(1)
		.then((rows) => rows[0] || null);

	if (!attachmentData) {
		return new Response(null, {
			status: 404,
			statusText: 'Not found',
		});
	}

	let result: Awaited<ReturnType<typeof getAttachmentResult>>;
	try {
		result = await getAttachmentResult(currentAccount.id, hash);
	} catch (error) {
		if (
			error instanceof Error &&
			'name' in error &&
			(error.name === 'NoSuchKey' ||
				// NOTE: AWS returns "AccessDenied" when a bucket entry is not found.
				// This is because we deny the ListBucket permission for security, which AWS
				// uses to scan when a bucket lookup fails. Treat this as a 404.
				(error.name === 'AccessDenied' && error.message?.includes('ListBucket')))
		) {
			return new Response(null, {
				status: 404,
				statusText: 'Not found',
			});
		}
		throw error;
	}

	const headers = new Headers();
	// Set Content-Type header, default to "application/octet-stream"
	// This triggers a download in the user's browser, better than failing to display.
	const contentType = result.ContentType || 'application/octet-stream';
	headers.set('Content-Type', contentType);
	headers.set('Content-Disposition', 'attachment');

	// Set Content-Length header, if available.
	// This helps browsers show download progress bars and improves UX for large files.
	if (result.ContentLength) {
		headers.set('Content-Length', result.ContentLength.toString());
	}

	// Set Content-Disposition header, if available.
	// This is used to set the filename for the user's browser, instead of the hash.
	const originalFilename = attachmentData?.filename;
	if (originalFilename) {
		const fallbackName = originalFilename.replace(/[\n\r"\\/]/g, '_');
		const encodedUtf8 = encodeURIComponent(originalFilename).replace(/\*/g, '%2A');
		headers.set(
			'Content-Disposition',
			`attachment; filename="${fallbackName}"; filename*=UTF-8''${encodedUtf8}`,
		);
	}

	invariant(result.Body, 'getAttachmentResult body not found');
	const stream = result.Body.transformToWebStream();
	return new Response(stream as BodyInit, {
		status: 200,
		headers,
	});
};
