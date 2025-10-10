import fs from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { parseMailDecoded } from '@workspace/core/mail-parser.js';
import { generateMailReport } from '../src/generateMailReport.js';

const { values } = parseArgs({
	options: {
		messageId: { type: 'string' },
	},
});

const testDataDir = new URL('../testdata/', import.meta.url);
let count = 0;

async function generateForMessageId(messageId: string) {
	const messageDir = new URL(`./${messageId}/`, testDataDir);

	let raw: string;
	try {
		raw = await fs.readFile(new URL('./raw.eml', messageDir), 'utf-8');
	} catch {
		// biome-ignore lint/suspicious/noConsole: script
		console.error(`Skipping ${messageId} because it doesn't have a raw.eml file`);
		return;
	}

	// biome-ignore lint/suspicious/noConsole: script
	console.error(`Generating report for ${messageId}`);

	const parsed = await parseMailDecoded(raw);
	try {
		const report = await generateMailReport({
			messageId,
			mail: parsed,
		});
		await fs.writeFile(new URL('./report.md', messageDir), report);
		count++;
	} catch {
		// biome-ignore lint/suspicious/noConsole: script
		console.error(`Error generating report for ${messageId}`);
	}
}

async function generateForAllMessages() {
	const messageIds = await fs.readdir(testDataDir);

	for (const messageId of messageIds) {
		await generateForMessageId(messageId);
	}
}

if (values.messageId) {
	await generateForMessageId(values.messageId);
} else {
	await generateForAllMessages();
}

// biome-ignore lint/suspicious/noConsole: script
console.error(`Generated ${count} reports`);
