import { env } from '@workspace/core/env.js';
import { verifyTokenPayload } from '@workspace/google/request-client.js';
import { invariant } from 'es-toolkit';
import { z } from 'zod';

const topicSchema = z.object({
	message: z.object({
		data: z.string(),
		messageId: z.string(),
		publishTime: z.string(),
	}),
	subscription: z.string(),
});

const messageSchema = z.object({
	emailAddress: z.string(),
	historyId: z.number().int(),
});

export async function handleGoogleWebhook(request: Request) {
	const authHeader = request.headers.get('Authorization');
	invariant(authHeader, 'Authorization header is required');
	const token = authHeader.split('Bearer ')[1];
	invariant(token, 'Token is required');
	const claim = await verifyTokenPayload(token);
	invariant(claim, 'Invalid token');
	invariant(claim.email === env.require('GOOGLE_SERVICE_ACCOUNT'), 'Incorrect service account');
	invariant(claim.email_verified, 'Email not verified');

	const json = await request.json();
	const topic = topicSchema.parse(json);
	const decodedData = Buffer.from(topic.message.data, 'base64').toString();

	return messageSchema.parse(JSON.parse(decodedData));
}
