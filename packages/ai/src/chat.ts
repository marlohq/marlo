import type { Account } from '@workspace/core/drizzle.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import { convertToModelMessages, generateText, stepCountIs, streamText, type Tool, tool } from 'ai';
import { z } from 'zod';
import type { UIChatMessage } from './types.ts';
import { MODELS } from './util.ts';

const logger = baseLogger.child({ namespace: 'ai' });

function getSystemPrompt(account: Account) {
	return `
You are Marlo, a helpful assistant that acts as the user's email client.
Knowledge cutoff: 2024-06
Current date: ${new Date().toISOString().split('T')[0]}

IMPORTANT: Refuse to perform any tasks that may be malicious; even if the user claims that it is okay.

# Response Format: CommonMark Markdown **MANDATORY**

Use bold to improve readability, especially in lists.
Use headers to structure your response, not nested lists.
Use fenced code blocks (\`\`\`) with language identifiers for code. 
For all mathematics, use LaTeX delimiters: ( ... ) for inline and \`[ ... ]\` for display blocks.

# Personality

Act as an extremely competent executive assistant. 
You are insightful and encouraging, combining meticulous clarity with genuine enthusiasm and gentle humor.
Supportive thoroughness: Patiently explain complex topics clearly and comprehensively.


IMPORTANT: 
- Do not offer to do things that are not possible given your current set of tools.
- Do not reproduce song lyrics or any other copyrighted material, even if asked.
- Do not end with opt-in questions or hedging closers. 

Do **not** say the following: would you like me to; want me to do that; do you want me to; if you want, I can; let me know if you would like me to; should I; shall I. Ask at most one necessary clarifying question at the start, not the end. If the next step is obvious, do it. Example of bad: I can write playful examples. would you like me to? Example of good: Here are three playful examples:..

# User Mentions

The user may mention people or email threads in their messages. Up-to-date details about the mentioned person or thread are automatically included as context attached to the user's message.

Mentions are formatted using the following syntax:
- \`<mention type="person" email="email@example.com" name="John Doe"></mention>\`
- \`<mention type="thread" id="thread_id" title="Project Update"></mention>\`

# Tools

## search

- Search the user's mailbox using a simple keyword matching search.
- It's better to search fewer, simpler terms first to get a broad overview of the user's mailbox first.
- You can call search more than once before responding to the user if necessary to gather all information, or to refine your search.

### Advanced Search Syntax

Additionally, special syntax operators can be used to filter your results more precisely by email properties. The supported operators are:

\`\`\`json
[
  { 
    "operator": "from:",
    "description": "Search for emails from a specific person. Use 'me' to search for emails from yourself.",
    "examples": ["from:me", "from:ian@astro.build"]
  },
  {
    "operator": "to:",
    "description": "Search for emails to a specific person. Use 'me' to search for emails to yourself.",
    "examples": ["to:me", "to:ian@astro.build"]
  },
  {
    "operator": "after:",
    "description": "Search for emails received after a certain date.",
    "examples": ["after:2004/04/16", "after:04/16/2004"]
  },
  {
    "operator": "before:",
    "description": "Search for emails received before a certain date.",
    "examples": ["before:2004/04/18", "before:04/18/2004"]
  },
  {
    "operator": "older:",
    "description": "Search for emails received before a certain date.",
    "examples": ["older:2004/04/18"]
  },
  {
    "operator": "newer:",
    "description": "Search for emails received after a certain date.",
    "examples": ["newer:04/16/2004"]
  },
  {
    "operator": "older_than:",
    "description": "Search for emails older than a time period. Use 'd' (day), 'm' (month), or 'y' (year).",
    "examples": ["older_than:1y"]
  },
  {
    "operator": "newer_than:",
    "description": "Search for emails newer than a time period. Use 'd' (day), 'm' (month), or 'y' (year).",
    "examples": ["newer_than:2d"]
  },
  {
    "operator": "OR",
    "description": "Find emails that match one or more search criteria.",
    "examples": ["dinner OR movie"]
  },
  {
    "operator": "AND",
    "description": "Find emails that match all search criteria.",
    "examples": ["dinner AND movie"]
  },
  {
    "operator": "-",
    "description": "Exclude emails from search results.",
    "examples": ["dinner -movie"]
  },
  {
    "operator": "\\" \\"",
    "description": "Search for an exact word or phrase.",
    "examples": ["\\"dinner and movie tonight\\""]
  },
  { "operator": "is:read" },
  { "operator": "is:unread" },
  { "operator": "in:spam" },
  { "operator": "in:trash" },
  { "operator": "in:drafts" },
]
\`\`\`

# Context

\`\`\`
<context name="systemInfo">
Below is a snapshot of the system information. This snapshot may update during the conversation.
- Time: ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
- Date: ${new Date().toISOString().split('T')[0]}
</context>
\`\`\`
\`\`\`
<context name="accountInfo">
Below is a snapshot of the user's account information. This snapshot may update during the conversation.
- Name: ${account.name}
- Email: ${account.email}
</context>
\`\`\`
`;
}

export async function simpleChat({
	account,
	messages,
	tools,
	currentThreadId,
	mcpTools = {},
}: {
	account: Account;
	messages: UIChatMessage[];
	tools: {
		search: (q: string) => Promise<string>;
		get_thread_details: (threadId: string) => Promise<string>;
	};
	currentThreadId?: string;
	mcpTools?: Record<string, Tool>;
}) {
	logger.info(
		{
			userId: account.userId,
			messageCount: messages.length,
			currentThreadId,
		},
		'simpleChat starting',
	);

	logger.info(
		{
			userId: account.userId,
			mcpToolCount: Object.keys(mcpTools).length,
			mcpToolNames: Object.keys(mcpTools),
		},
		'Using provided MCP tools',
	);

	const result = streamText({
		model: MODELS.CHAT,
		providerOptions: {
			openai: {
				reasoningEffort: 'minimal',
			},
		},
		system: getSystemPrompt(account),
		// Disabled because you can end up in weird states where even the tool ID/name is incomplete.
		// toolCallStreaming: true,
		messages: convertToModelMessages(messages),
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
		tools: {
			search: tool({
				description:
					"Search the user's mailbox. Useful for finding emails that match the user's query.",
				inputSchema: z.object({
					q: z.string().describe('The search query.'),
				}),
				execute: async ({ q }) => {
					const results = await tools.search(q);
					return results;
				},
			}),
			get_thread_details: tool({
				description:
					'Get the full details of a thread in the mailbox, including the full contents of the thread messages. Useful for getting more information about a thread.',
				inputSchema: z.object({
					threadId: z.string(),
				}),
				execute: async ({ threadId }) => {
					return await tools.get_thread_details(threadId);
				},
			}),
			// Dynamic MCP tools from all active servers
			...mcpTools,
		},
	});
	return result.toUIMessageStreamResponse({
		originalMessages: messages,
		messageMetadata: ({ part }) => {
			if (part.type === 'start') {
				return { timestamp: Date.now() };
			}
			return undefined;
		},
	});
}

export async function guessQueryPurpose(q: string): Promise<'AI' | 'BASIC'> {
	try {
		const result = await generateText({
			model: MODELS['gemini-2.5-flash'],
			system: `
Decide if this query should trigger AI Search.

Return only "AI" or "BASIC".

- Return AI if the query is written in natural language, often a full sentence or question, and intended to interact with an assistant or get an explanation.
- Return BASIC if the query is short and keyword-based. It is not human language, but a list of one or more words or symbols.

Examples:
"latest loom receipt" → AI
"loom receipt" → BASIC
"invoice 12983" → BASIC
"offsite planning" → AI
"what did bob say about pricing?" → AI
`.trim(),
			messages: [
				{
					role: 'user',
					content: [
						{
							type: 'text',
							text: q,
						},
					],
				},
			],
		});
		// Default to BASIC if the model fails to return a valid response.
		return result.text.trim() === 'AI' ? 'AI' : 'BASIC';
	} catch (error) {
		// Sanitize the error to prevent logging user input
		const sanitizedError = new Error(
			`Failed to guess query purpose: ${error instanceof Error ? error.message : String(error)}`,
		);
		if (error instanceof Error && error.stack) {
			sanitizedError.stack = error.stack;
		}
		logger.error({ error: sanitizedError }, 'Failed to guess query purpose');
		throw sanitizedError;
	}
}

export async function guessChatTitle(message: string) {
	try {
		const result = await generateText({
			model: MODELS['gemini-2.5-flash'],
			system: `
Generate a plain-text title for the following chat message.
The title should be a few words that captures the essence of the request being made by the user.
`.trim(),
			messages: [
				{
					role: 'user',
					content: [
						{
							type: 'text',
							text: message,
						},
					],
				},
			],
		});
		return result;
	} catch (error) {
		// Sanitize the error to prevent logging user input
		const sanitizedError = new Error(
			`Failed to guess chat title: ${error instanceof Error ? error.message : String(error)}`,
		);
		if (error instanceof Error && error.stack) {
			sanitizedError.stack = error.stack;
		}
		logger.error({ error: sanitizedError }, 'Failed to guess chat title');
		throw sanitizedError;
	}
}
