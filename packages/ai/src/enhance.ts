import { logger as baseLogger } from '@workspace/core/logger.ts';
import { stepCountIs, streamText } from 'ai';
import { MODELS } from './util.ts';

const logger = baseLogger.child({
	component: 'enhance',
});

function getSystemPrompt(draftEmail: string, recentMessages: string | null) {
	return `
You are being provided partial content of a draft email.

# Instructions
- Improve the snippet of writing to make it more polished.
- Fix any grammatical, spelling, punctuation, formatting, style, or tone errors.
- Using your expertise as a professional writer, improve the provided snippet of writing. 
- Take into consideration the full context of the draft email and previous messages in the thread, if any exist.
- Some general best practices to follow:
    - Fix any grammatical, spelling, punctuation, formatting errors.
    - Keep it clear and concise.
    - Use complete sentences.
    - Be specific, avoid vague wording.
    - Indicate urgency, if applicable.
    - Make sure action items aren't hidden, or unclear.
- The snippet could either be a draft, or it could be instructions / notes on what the user would like to be written.
- Do not include any new information that is not in the provided content.
- Do not add any form of greetings or signatures unless they are already in the snippet.
- Always reword the snippet, as the user is asking for a rewrite, never return the original content unchanged.

# Context

\`\`\`
<context name="draftEmail">
Here is the full content of the draft email. Use it to better understand the context of the email. You are only rewriting the portion of the email that is provided by the user.

${draftEmail}
</context>
\`\`\`

\`\`\`
<context name="recentMessages">
Here is a list of recent messages between the sender and the recipient. Use it to better understand the relationship between the sender and the recipient.

${recentMessages}
</context>
\`\`\`
    `;
}

export function simpleEnhance({
	fullDraft,
	content,
	recentMessages,
}: {
	fullDraft: string;
	content: string;
	recentMessages: string | null;
}) {
	const result = streamText({
		model: MODELS['gemini-2.5-flash'],
		system: getSystemPrompt(fullDraft, recentMessages),
		// Disabled because you can end up in weird states where even the tool ID/name is incomplete.
		// toolCallStreaming: true,
		messages: [
			{
				role: 'user',
				content: [
					{
						type: 'text',
						text: content,
					},
				],
			},
		],
		stopWhen: stepCountIs(20),
		onStepFinish: (step) => {
			if (process.env.NODE_ENV === 'development') {
				logger.info({ text: step.text, usage: step.usage }, 'chat:step');
			}
		},
		onFinish: (result) => {
			if (process.env.NODE_ENV === 'development') {
				logger.info({ text: result.text, usage: result.usage }, 'chat:finish');
			}
		},
		onError: (error) => {
			logger.error({ error }, 'chat:error');
		},
	});
	return result.toUIMessageStreamResponse();
}
