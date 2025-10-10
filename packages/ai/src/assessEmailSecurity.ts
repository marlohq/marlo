import { logger as baseLogger } from '@workspace/core/logger.js';
import { generateObject } from 'ai';
import { z } from 'zod';
import { MODELS } from './util.ts';

const logger = baseLogger.child({ namespace: 'ai' });

const securityAssessmentSchema = z.object({
	level: z.enum(['HIGH', 'MEDIUM', 'LOW']),
	score: z.number().min(0).max(100),
	reasoning: z.string(),
});

export type SecurityAssessmentResult = z.infer<typeof securityAssessmentSchema>;

export async function assessEmailSecurity({
	threadId,
	messages,
}: {
	threadId: string;
	messages: Array<{
		messageId: string;
		sentAt: Date;
		senderEmail: string;
		subject: string;
		headers: string;
		body: string;
	}>;
}): Promise<SecurityAssessmentResult> {
	const timer = performance.now();
	let result;
	let usage;

	try {
		const prompt = getThreadSecurityAssessmentPrompt(messages);

		const response = await generateObject({
			model: MODELS['gemini-2.5-pro'],
			schema: securityAssessmentSchema,
			prompt,
		});

		result = response.object;
		usage = response.usage;
	} catch (error) {
		// Sanitize the error to prevent logging email content
		const sanitizedError = new Error(
			`Failed to assess thread security for ${threadId}: ${error instanceof Error ? error.message : String(error)}`,
		);
		if (error instanceof Error && error.stack) {
			sanitizedError.stack = error.stack;
		}
		logger.error({ threadId, error: sanitizedError }, 'Failed to assess thread security');
		throw sanitizedError;
	}

	logger.debug(
		{
			threadId,
			messageCount: messages.length,
			result: { level: result.level, score: result.score },
			duration: performance.now() - timer,
			usage,
		},
		'thread security assessment',
	);

	return result;
}

function getThreadSecurityAssessmentPrompt(
	messages: Array<{
		messageId: string;
		sentAt: Date;
		senderEmail: string;
		subject: string;
		headers: string;
		body: string;
	}>,
): string {
	const messageContents = messages
		.map((msg, index) => {
			return `
--- MESSAGE ${index + 1} (sent ${msg.sentAt.toISOString()}) ---
From: ${msg.senderEmail}
Subject: ${msg.subject}

Headers:
${msg.headers}

Body:
${msg.body}
`;
		})
		.join('\n');

	return `You are an expert analyzer of email threads whose job it is to assess whether a conversation thread contains potential scams or phishing attempts. You will assess the entire email thread below and assign a risk level of either HIGH, MEDIUM, or LOW.

Things that might indicate a potential scam include:

- Someone who is claiming to be someone other than who they actually are based on email headers.
- Someone who claims to represent a company but has a suspicious email address in the From field.
- A message indicating that the reader participate in activity that could be considered illegal.
- A message asking the reader to send money either by phone or through a link to a web address which could be fraudulent.
- Progressive trust-building tactics across multiple messages leading to a scam.
- Conversation patterns that escalate urgency or pressure.
- Impersonation attempts that develop over multiple exchanges.
- Messages with attachments that are not clearly related to the email content.

When analyzing a thread, consider:
- The progression of the conversation and any escalating tactics
- Consistency of sender identity across messages
- Whether legitimate business communications would follow this pattern
- Any attempts to build trust before making suspicious requests

Additionally, provide a numerical score from 0-100 (where 0 is completely safe and 100 is extremely dangerous) and a brief reasoning for your assessment.

Return your response in this exact format:
- level: HIGH, MEDIUM, or LOW
- score: A number from 0-100
- reasoning: Brief explanation of your assessment focusing on the thread patterns

----

THREAD CONTENTS (${messages.length} messages):
${messageContents}`;
}
