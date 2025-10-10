import fs from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { runOnEachMessage, runOnMessage } from './lib/run-on-each-message.js';

const { values } = parseArgs({
	options: {
		messageId: { type: 'string' },
	},
});

async function saveResult(ret: Awaited<ReturnType<typeof runOnMessage>>) {
	if (!ret) return;
	const { messageDir, result } = ret;

	await Promise.all([
		fs.writeFile(new URL('./reasoning.txt', messageDir), result.reasoningText),
		fs.writeFile(new URL('./answer.txt', messageDir), result.category),
	]);
}

if (values.messageId) {
	const result = await runOnMessage(values.messageId);
	await saveResult(result);
} else {
	for await (const ret of runOnEachMessage()) {
		await saveResult(ret);
	}
}
