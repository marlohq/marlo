import {
	analyzeSearch,
	serializeDetailedThread,
	serializeReferenceThread,
	simpleChat,
	type UIChatMessage,
} from '@workspace/ai';
import { createDynamicMCPTools } from '@workspace/backend/tools/mcp-tools-dynamic.ts';
import { type Account, contact as contactTable, db, inArray } from '@workspace/core/drizzle.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import { type GmailClient, getGmailClientForAccount } from '@workspace/google/request-client.js';
import type { UIMessage } from 'ai';
import type { APIRoute } from 'astro';
import { invariant } from 'es-toolkit';
import { getCurrentAccountOrThrow } from '../../../lib/auth.js';
import { search } from '../../../lib/google.js';

interface ParsedMention {
	type: 'person' | 'thread';
	id: string;
	label: string;
}

function parseEncodedMentions(content: string): { mentions: ParsedMention[] } {
	const mentions: ParsedMention[] = [];
	let mentionCounter = 1;

	// Parse XML mention syntax: <mention type="person" email="..." name="..."></mention>
	const mentionRegex =
		/<mention\s+type="(person|thread)"\s+(?:email|id)="([^"]*)"\s+(?:name|title)="([^"]*)"><\/mention>/g;

	let match;

	// biome-ignore lint/suspicious/noAssignInExpressions: this is the normal way to do regex loops
	while ((match = mentionRegex.exec(content)) !== null) {
		const [fullMatch, type, id, label] = match;

		mentions.push({
			type: type as 'person' | 'thread',
			id: id ?? '',
			label: label ?? '',
		});

		mentionCounter++;
	}

	return {
		mentions,
	};
}

function getMessageText(message: UIMessage): string {
	return message.parts
		.filter((part) => part.type === 'text')
		.map((part) => part.text)
		.join('');
}

// NOTE: This assumes a single text part per message. This is due to how the AI SDK
// used to work in the past, and the fact that user messages always will have a text part.
// If you ran this on an assistant message, it could break or be incorrect.
function appendMessageText(message: UIMessage, text: string): void {
	message.parts.push({ type: 'text', text });
}

async function processMessagesForMentions(messages: UIChatMessage[]) {
	// Process mentions in user messages
	return Promise.all(
		messages.map(async (message) => {
			if (message.role !== 'user') {
				return message;
			}

			// Parse encoded content to extract mentions
			const messageText = getMessageText(message);
			const { mentions } = parseEncodedMentions(messageText);
			if (mentions.length === 0) {
				return message;
			}

			// Group mentions by type
			const { personEmails, threadIds } = mentions.reduce(
				(acc, mention) => {
					if (mention.type === 'person') {
						acc.personEmails.push(mention.id);
					} else if (mention.type === 'thread') {
						acc.threadIds.push(mention.id);
					}
					return acc;
				},
				{ personEmails: [] as string[], threadIds: [] as string[] },
			);

			// Fetch person data
			const mentionedPeople =
				personEmails.length > 0
					? await db
							.select({
								email: contactTable.email,
								name: contactTable.name,
								// Add any other relevant contact fields
							})
							.from(contactTable)
							.where(inArray(contactTable.email, personEmails))
					: [];

			// Fetch thread data
			const mentionedThreads =
				threadIds.length > 0
					? await db.query.thread.findMany({
							where: (thread, { inArray }) => inArray(thread.id, threadIds),
							columns: {
								id: true,
								lastSentAt: true,
								resolvedAt: true,
							},
							with: {
								messages: {
									limit: 1,
									columns: {
										senderEmail: true,
										senderName: true,
										sentAt: true,
										subject: true,
										snippet: true,
										contentText: true,
										contentHtml: true,
										extractedContent: true,
										deletedAt: true,
										draftId: true,
									},
									with: {
										messageRecipients: true,
									},
									orderBy: (message, { desc }) => [desc(message.sentAt)],
								},
							},
						})
					: [];

			if (mentionedPeople.length === 0 && mentionedThreads.length === 0) {
				return message;
			}

			// Create annotation-style references
			let annotationCounter = 1;
			const annotations: string[] = [];

			// Create a map for quick lookup
			const personMap = new Map(mentionedPeople.map((p) => [p.email, p]));
			const threadMap = new Map(mentionedThreads.map((t) => [t.id, t]));

			// Replace mentions with annotations in order they appear
			mentions.forEach((mention) => {
				if (mention.type === 'person') {
					const person = personMap.get(mention.id);
					if (person) {
						// Use JSON format for person data
						const personData = JSON.stringify({
							email: person.email,
							name: person.name || mention.label || 'Unknown',
						});
						annotations.push(`[${annotationCounter}]: ${personData}`);
						annotationCounter++;
					}
				} else if (mention.type === 'thread') {
					const thread = threadMap.get(mention.id);
					if (thread) {
						// Transform the data to match expected structure
						const transformedThread = {
							...thread,
							messages: thread.messages.map((msg) => ({
								...msg,
								recipients: msg.messageRecipients,
							})),
						};
						// Use serializeDetailedThread for consistent JSON format
						annotations.push(
							`[${annotationCounter}]: ${serializeDetailedThread(transformedThread)}`,
						);
						annotationCounter++;
					}
				}
			});

			// Append annotations to the message
			if (annotations.length > 0) {
				appendMessageText(message, annotations.join('\n'));
			}

			return message;
		}),
	);
}

// Define the getThreadDetails function
export async function getThreadDetails(threadId: string, currentAccount: Account) {
	const thread = await db.query.thread.findFirst({
		where: (thread, { eq, and }) =>
			and(eq(thread.id, threadId), eq(thread.accountId, currentAccount.id)),
		columns: {
			id: true,
			lastSentAt: true,
			resolvedAt: true,
		},
		with: {
			messages: {
				columns: {
					senderEmail: true,
					senderName: true,
					subject: true,
					contentText: true,
					contentHtml: true,
					extractedContent: true,
					deletedAt: true,
					sentAt: true,
					draftId: true,
				},
				with: {
					messageRecipients: true,
				},
				orderBy: (message, { desc }) => [desc(message.sentAt)],
			},
		},
	});
	if (!thread) {
		return JSON.stringify({ error: 'Thread not found' });
	}
	// Transform the data to match expected structure
	const transformedThread = {
		...thread,
		messages: thread.messages.map((msg) => ({
			...msg,
			recipients: msg.messageRecipients,
		})),
	};
	return serializeDetailedThread(transformedThread);
}

// Define the search function
export async function searchAllMail(q: string, gmail: GmailClient, currentAccount: Account) {
	const { results } = await search(q, gmail);
	const remoteIds = results.map((t) => t.id).filter(Boolean);

	if (remoteIds.length === 0) {
		return '';
	}

	const threads = await db.query.thread.findMany({
		limit: 25,
		where: (thread, { eq, and, inArray }) =>
			and(inArray(thread.remoteId, remoteIds), eq(thread.accountId, currentAccount.id)),
		columns: {
			id: true,
			lastSentAt: true,
			resolvedAt: true,
		},
		with: {
			messages: {
				limit: 1,
				columns: {
					senderEmail: true,
					senderName: true,
					sentAt: true,
					subject: true,
					snippet: true,
					deletedAt: true,
					draftId: true,
				},
				with: {
					messageRecipients: true,
				},
				orderBy: (message, { desc }) => [desc(message.sentAt)],
			},
		},
		orderBy: (thread, { desc }) => [desc(thread.lastSentAt)],
	});
	return threads
		.map((thread) => ({
			...thread,
			messages: thread.messages.map((msg) => ({
				...msg,
				recipients: msg.messageRecipients,
			})),
		}))
		.map(serializeReferenceThread)
		.map((t) => `<email>${t}</email>`)
		.join('\n');
}

const logger = baseLogger.child({ namespace: 'api-chat' });

// Server endpoint that matches the chat action
export const POST: APIRoute = async ({ request, locals, params, url }) => {
	const { id } = params;
	if (!id) {
		return new Response(JSON.stringify({ error: 'No ID provided' }), { status: 400 });
	}

	const { messages } = (await request.json()) as { messages: UIChatMessage[] };
	const currentAccount = await getCurrentAccountOrThrow({ locals });

	logger.info(
		{
			promptId: id,
			userId: currentAccount.userId,
			messageCount: messages.length,
		},
		'API chat request received',
	);

	const gmailResponse = await getGmailClientForAccount(currentAccount);
	invariant(!gmailResponse.error, `Gmail client error: ${gmailResponse.error}`);

	if (id === 'chat') {
		logger.info(
			{ userId: currentAccount.userId },
			'Processing chat request - starting message processing',
		);

		const processedMessages = await processMessagesForMentions(messages);
		if (processedMessages[0]) {
			const chatId = url.searchParams.get('id');
			const chat = await db.query.chatConversation.findFirst({
				where: (chat, { eq }) => eq(chat.id, chatId || ''),
			});
			if (chat?.threadId) {
				const threadDetails = await getThreadDetails(chat.threadId, currentAccount);
				appendMessageText(
					processedMessages[0],
					`<context name="Thread Details">${threadDetails}</context>`,
				);
			}
		}

		logger.info(
			{
				userId: currentAccount.userId,
				originalCount: messages.length,
				processedCount: processedMessages.length,
				hasThreadMentions: processedMessages.some(
					(m) => getMessageText(m).includes('[') && getMessageText(m).includes(']'),
				),
			},
			'Messages processed, loading MCP tools and calling simpleChat',
		);

		const mcpTools = await createDynamicMCPTools(currentAccount);

		return simpleChat({
			account: currentAccount,
			messages: processedMessages,
			tools: {
				search: (q) => searchAllMail(q, gmailResponse.client, currentAccount),
				get_thread_details: (threadId) => getThreadDetails(threadId, currentAccount),
			},
			mcpTools,
		});
	}

	if (id === 'search') {
		const userMessage = messages.find((m) => m.role === 'user');
		invariant(userMessage, 'No user message found');
		const query = getMessageText(userMessage);
		invariant(query, 'No query found');
		return analyzeSearch({
			account: currentAccount,
			query,
			tools: {
				search: (q) => searchAllMail(q, gmailResponse.client, currentAccount),
				get_thread_details: (threadId) => getThreadDetails(threadId, currentAccount),
			},
		});
	}

	return new Response(JSON.stringify({ error: 'Invalid Prompt ID' }), { status: 400 });
};
