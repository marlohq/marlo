import {
	PromptInput,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputToolbar,
	PromptInputTools,
} from '@workspace/ui/ai';
import type { FormEventHandler } from 'react';

export function ChatInput({ onSubmit }: { onSubmit: FormEventHandler<HTMLFormElement> }) {
	return (
		<PromptInput onSubmit={onSubmit}>
			<PromptInputTextarea />
			<PromptInputToolbar>
				<PromptInputTools></PromptInputTools>
				<PromptInputSubmit />
			</PromptInputToolbar>
		</PromptInput>
	);
}
