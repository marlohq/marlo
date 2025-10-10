import type { Editor } from '@tiptap/react';
import { prependBackendUrl } from '@workspace/core/url.ts';
import { invariant } from 'es-toolkit';
import { useState } from 'react';
import { z } from 'zod';

// NOTE: Migration, not actually coupled to the API endpoint, so this could drift.
const enhanceRequestSchema = z.object({
	draftMessageId: z.string(),
	content: z.string(),
});

type EnhanceRequest = z.infer<typeof enhanceRequestSchema>;

class AISDKProtocolTransformer implements Transformer<string, string> {
	private container = '';
	private readonly relevantLinePrefix = '0:';

	transform(chunk: string, controller: TransformStreamDefaultController<string>): void {
		this.container += chunk; // Append new chunk to existing buffer
		const lines: string[] = this.container.split('\n'); // Split into potential lines

		// The last element might be an incomplete line, so we keep it in the buffer.
		// If chunk ended with '\n', lines.pop() will be an empty string.
		this.container = lines.pop() || '';

		for (const line of lines) {
			if (line.startsWith(this.relevantLinePrefix)) {
				const data = line.substring(this.relevantLinePrefix.length);
				controller.enqueue(JSON.parse(data) as string); // Enqueue the data part of the relevant line
			}
			// Lines not starting with "0:" are implicitly ignored.
		}
	}

	flush(controller: TransformStreamDefaultController<string>): void {
		// Process any remaining data in the container (e.g., the very last line of the stream)
		if (this.container) {
			if (this.container.startsWith(this.relevantLinePrefix)) {
				const data = this.container.substring(this.relevantLinePrefix.length);
				controller.enqueue(data);
			}
			this.container = ''; // Clear container after flushing
		}
	}
}

export type EnhanceState = 'idle' | 'enhancing';

export function useEnhance({
	draftMessageId,
	editor,
}: {
	draftMessageId?: string | null;
	editor: Editor;
}) {
	const [state, setState] = useState<EnhanceState>('idle');

	// Enhancing is allowed only if there is a selection and we are not currently enhancing.
	const enhancingEnabled = !editor.state.selection.empty && state === 'idle';

	const enhance = async () => {
		// We need a draft message ID to enhance.
		if (!draftMessageId) {
			return;
		}

		const fullText = editor.getHTML();
		const selection = editor.state.selection;
		const hasSelection = !selection.empty;
		const selectedText = hasSelection
			? editor.state.doc.textBetween(selection.from, selection.to, ' ')
			: '';

		setState('enhancing');
		fetch(prependBackendUrl('/api/enhance'), {
			method: 'POST',
			body: JSON.stringify({
				draftMessageId,
				content: selectedText || fullText,
			} satisfies EnhanceRequest),
		})
			.then(async (response) => {
				invariant(response.body, 'Expected response body to be present');
				const stream = response.body
					.pipeThrough(new TextDecoderStream())
					.pipeThrough(new TransformStream<string, string>(new AISDKProtocolTransformer()));

				const onFinish = () => setState('idle');
				editor.chain().focus().streamContent(stream, 20, onFinish).run();
			})
			.catch(() => {});
	};

	return {
		enhance,
		state,
		enhancingEnabled,
	};
}
