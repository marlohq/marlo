import { logger as baseLogger } from '@workspace/core/logger.js';
import { APICallError, generateText } from 'ai';
import { MODELS } from './util.ts';

const logger = baseLogger.child({ namespace: 'ai' });

type AnalysisReturn = Awaited<ReturnType<typeof analyzeAttachment>>;

/** Currently only supports PDFs */
export async function analyzeAttachment(data: Buffer) {
	const timer = performance.now();
	let result;
	try {
		result = await generateText({
			model: MODELS.PDF,
			messages: [
				{
					role: 'user',
					content: [
						{
							type: 'text',
							text: `OCR the following page into Markdown. Tables should be formatted as HTML. Do not surround your output with triple backticks. Output only the Markdown, no other text.`,
						},
						{
							type: 'file',
							data: data,
							mediaType: 'application/pdf',
						},
					],
				},
			],
		});
		logger.debug(
			{ duration: performance.now() - timer, usage: result.usage },
			'PDF attachment analyzed',
		);
		return result.text;
	} catch (error) {
		// This error means that the PDF either is actually really empty, or that it's password protected. Gemini doesn't throw a good error either way.
		// Unfortunately, there's no good cheap way to tell if a PDF is passworded, so we'll just ignore this specific error for now.
		if (APICallError.isInstance(error) && error.message.includes('The document has no pages.')) {
			return null;
		}

		throw error;
	}
}
