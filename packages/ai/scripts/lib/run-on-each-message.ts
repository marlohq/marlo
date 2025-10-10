import fs from 'node:fs/promises';
import { categorizeMessage } from '../../src/generateMailTagging.js';

const testDataDir = new URL('../../testdata/', import.meta.url);

export async function runOnMessage(messageId: string) {
	const messageDir = new URL(`./${messageId}/`, testDataDir);

	let raw: string;
	try {
		raw = await fs.readFile(new URL('./raw.eml', messageDir), 'utf-8');
	} catch {
		// biome-ignore lint/suspicious/noConsole: script
		console.error(`Skipping ${messageId} because it doesn't have a raw.eml file`);
		return;
	}

	let report: string;
	try {
		report = await fs.readFile(new URL('./report.md', messageDir), 'utf-8');
	} catch {
		// biome-ignore lint/suspicious/noConsole: script
		console.error(`Skipping ${messageId} because it doesn't have a report.md file`);
		return;
	}

	// biome-ignore lint/suspicious/noConsole: script
	console.error(`Running on ${messageId}`);
	const result = await categorizeMessage({ messageId, report, contactScore: 0 });

	return {
		messageDir,
		result,
	};
}

export async function* runOnEachMessage() {
	const messageIds = await fs.readdir(testDataDir);

	for (const messageId of messageIds) {
		const result = await runOnMessage(messageId);
		if (result) {
			yield result;
		}
	}
}
