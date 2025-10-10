import fs from 'node:fs/promises';
import { db, type Message, message as messageTable } from '@workspace/core/drizzle.js';
import { parseMailDecoded } from '@workspace/core/mail-parser.js';
import { getMessage } from '@workspace/core/storage/raw.js';

const limit = process.argv[2] || 1000;

const testdataDir = new URL('../testdata/', import.meta.url);
await fs.mkdir(testdataDir, { recursive: true });

async function getRawData(readableStream: ReadableStream) {
	const decoder = new TextDecoder();
	const reader = readableStream.getReader();
	let result = '';
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break; // End of stream
			}
			result += decoder.decode(value);
		}
	} finally {
		reader.releaseLock();
	}
	return result;
}

let count = 0;
export async function generateDatasetFromMessages(messages: Message[]): Promise<void> {
	await Promise.all(
		messages.map(async (message) => {
			if (!message.accountId) return;
			const stream = await getMessage(message.accountId, message.remoteId);
			if (!stream) return;
			const raw = await getRawData(stream);

			const parsed = await parseMailDecoded(raw);
			const messageId = parsed.messageId;
			if (!messageId) return;

			const messageDir = new URL(`./${messageId}/`, testdataDir);

			await fs.mkdir(messageDir, { recursive: true });

			await fs.writeFile(new URL(`./raw.eml`, messageDir), raw);
			count++;
		}),
	);
}

export async function generateDatasetFromAllMessages(): Promise<void> {
	const messages = await db.select().from(messageTable).limit(Number(limit));

	return generateDatasetFromMessages(messages);
}

await generateDatasetFromAllMessages();

// biome-ignore lint/suspicious/noConsole: script
console.error(`Generated ${count} messages`);
