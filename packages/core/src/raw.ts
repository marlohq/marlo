import { text } from 'node:stream/consumers';
import { uploadMessage } from '@workspace/core/storage/raw.js';

export async function rawToString(messageStream: ReadableStream): Promise<string> {
	return await text(messageStream as unknown as NodeJS.ReadableStream);
}

export async function uploadRawMessage(
	accountId: string,
	messageRemoteId: string,
	raw: string,
): Promise<{ status: 'ok' }> {
	const buffer = Buffer.from(raw, 'base64');
	await uploadMessage(accountId, messageRemoteId, buffer);

	return {
		status: 'ok',
	};
}
