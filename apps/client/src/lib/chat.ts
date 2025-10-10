import type { UIMessage as AIMessage } from '@ai-sdk/react';
import type { UIChatMessage } from '@workspace/ai';
import { mutate } from '@workspace/local/mutate.ts';
import type { ChatConversationData, ChatMessageData } from '@workspace/sync-data/data.ts';

type AIMessageRole = AIMessage['role'];

function getUIMessageText(message: AIMessage): string {
	return message.parts
		.filter((part) => part.type === 'text')
		.map((part) => part.text)
		.join('');
}

// Our model -> AI SDK model
function convertChatMessageToAIMessage(message: ChatMessageData): UIChatMessage {
	return {
		id: message.id,
		role: message.role as AIMessageRole,
		// backward compatibility with old message.content
		parts:
			message.parts && message.parts.length > 0
				? (message.parts as UIChatMessage['parts'])
				: [{ type: 'text', text: message.content }],
		metadata: {
			timestamp: new Date(message.createdAt).getTime(),
		},
	};
}

export function convertChatMessagesToAIMessages(messages: ChatMessageData[]): UIChatMessage[] {
	return messages
		.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
		.map((message) => convertChatMessageToAIMessage(message));
}

// AI SDK model -> Our model
export function convertAIMessageToChatMessage(
	message: AIMessage,
	conversationId: string,
): ChatMessageData {
	const timestampMs =
		(message.metadata as unknown as { timestamp: number })?.timestamp ?? Date.now();
	const createdAt = new Date(timestampMs).toISOString();
	return {
		id: message.id,
		role: message.role as AIMessage['role'],
		content: getUIMessageText(message),
		createdAt,
		conversationId,
		parts: message.parts,
	};
}

// Mutations
export async function appendMessageAndSave(chat: ChatConversationData, message: ChatMessageData) {
	chat.updatedAt = new Date().toISOString();
	chat.chatMessages.push(message);
	return await mutate.conversations.update(chat.id, chat);
}
