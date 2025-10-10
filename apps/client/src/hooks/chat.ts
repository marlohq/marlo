import { useChat } from '@ai-sdk/react';
import type { UIChatMessage } from '@workspace/ai';
import { prependBackendUrl } from '@workspace/core/url.ts';
import type { ChatConversationData, ChatMessageData } from '@workspace/sync-data/data.js';
import { DefaultChatTransport } from 'ai';
import { useEffect } from 'react';
import {
	appendMessageAndSave,
	convertAIMessageToChatMessage,
	convertChatMessagesToAIMessages,
} from '../lib/chat.ts';

export function useConversation({
	chat,
	initialMessages,
}: {
	chat: ChatConversationData;
	initialMessages: ChatMessageData[];
}) {
	const {
		messages: processedMessages,
		sendMessage,
		regenerate,
		status,
	} = useChat<UIChatMessage>({
		transport: new DefaultChatTransport({
			api: prependBackendUrl(`/api/prompt/chat?id=${chat.id}`),
		}),
		messages: convertChatMessagesToAIMessages(initialMessages),
		onFinish: ({ message }) => {
			appendMessageAndSave(chat, convertAIMessageToChatMessage(message, chat.id));
		},
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only on mount
	useEffect(() => {
		if (initialMessages.at(-1)?.role === 'user') {
			regenerate();
		}
	}, []);

	return {
		messages: processedMessages,
		append: (message: string) => {
			sendMessage({ text: message, metadata: { timestamp: Date.now() } });
		},
		regenerate,
		status,
	};
}
