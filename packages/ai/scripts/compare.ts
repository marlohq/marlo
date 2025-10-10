import fs from 'node:fs/promises';
import { parseArgs } from 'node:util';
import chalk from 'chalk';
import { runOnEachMessage, runOnMessage } from './lib/run-on-each-message.js';
import { diffStrings } from './lib/string-diff.js';

const { values } = parseArgs({
	options: {
		categoryId: { type: 'string' },
		messageId: { type: 'string' },
	},
});
async function printResult(ret: Awaited<ReturnType<typeof runOnMessage>>) {
	if (!ret) return;
	const { messageDir, result } = ret;

	const reasoning = (await fs.readFile(new URL('./reasoning.txt', messageDir), 'utf-8')).trim();
	const answer = (await fs.readFile(new URL('./answer.txt', messageDir), 'utf-8')).trim();

	if (answer !== result.category) {
		// biome-ignore lint/suspicious/noConsole: script
		console.log(`Answer mismatch:`);
		// biome-ignore lint/suspicious/noConsole: script
		console.log(`Expected: ${chalk.green(answer)}`);
		// biome-ignore lint/suspicious/noConsole: script
		console.log(`Got: ${chalk.red(result.category)}`);
		// biome-ignore lint/suspicious/noConsole: script
		console.log('--------------------------------');
		// biome-ignore lint/suspicious/noConsole: script
		console.log(diffStrings(reasoning, result.reasoningText));
	}
}

if (values.messageId) {
	const ret = await runOnMessage(values.messageId);
	await printResult(ret);
} else {
	for await (const ret of runOnEachMessage()) {
		await printResult(ret);
	}
}
