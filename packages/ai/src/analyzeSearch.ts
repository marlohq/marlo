import type { Account } from '@workspace/core/drizzle.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import { stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';
import { MODELS } from './util.ts';

const logger = baseLogger.child({ namespace: 'ai' });

function getSystemPrompt(account: Account) {
	return `
Generate a **SHORT** "AI Summary" for the user's search query. Use search tools to find the most relevant information to answer the query. 


## Tone and Style

- You should be **concise**, direct and to the point.
- This is not a conversation. DO NOT respond conversationally. DO NOT end your response with a suggestion or proactive offer like "For more details..." or "Would you like me to..."
- No lists (bulleted, numbered, etc) are allowed in your response unless absolutely necessary. Use SHORT paragraphs to break up your response instead.
- Bold thread subjects and sender names in your response. Otherwise, no styling (bold, italic, etc) is allowed.
- The most important information should be included in the beginning of your response. 
- Attribute any facts and statements from search results to the sender who made them. Don't repeat them as universal truths.
- Keep your response short and concise, 3 paragraphs max.

# Assistant Response Citations

- ALWAYS cite threads retrieved by tool calls as sources to corroborate your answers.
- Add inline citations to each paragraph of your response to attribute information to the thread that provided it.
- Use Markdown image syntax to add citations, like this: \`![cite](THREAD_ID)\`
- If multiple threads could be cited for a specific piece of information, choose the most recent one. Only add the most relevant citations to your response, don't overdo it!
- For example: "The receipt was sent by Ian. ![cite](1234567890)"

# Tools

## search

- Search the user's mailbox using a simple keyword matching search.
- It's better to search few, simple terms first and then refine later.
- Before giving up due to no results, consider searching related terms to the user's query.
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

# CONTEXT

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

export async function analyzeSearch({
	account,
	query,
	tools,
}: {
	account: Account;
	query: string;
	tools: {
		search: (q: string) => Promise<string>;
		get_thread_details: (threadId: string) => Promise<string>;
	};
}) {
	const result = streamText({
		model: MODELS.CHAT,
		providerOptions: {
			openai: {
				reasoningEffort: 'minimal',
			},
		},
		system: getSystemPrompt(account),
		messages: [
			{
				role: 'user',
				content: [
					{
						type: 'text',
						text: query,
					},
				],
			},
		],
		stopWhen: stepCountIs(6),
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
		},
	});
	return result.toUIMessageStreamResponse();
}
