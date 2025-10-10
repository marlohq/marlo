import { Extension } from '@tiptap/core';
import type { Fragment, Node as ProseMirrorNode } from 'prosemirror-model';
import { STREAMING_MARK_NAME, StreamingMark } from './StreamingMark.ts';

// NOTE(fks, 2025-08-26): This file was mostly AI-generated to start, since it touches on so many
// esoteric TipTap editor concepts. It has been been cleaned up and likely evolved since then, but
// that context is important to understanding the code in this file.
//
// Prompt:
//   I want to build a TipTap extension that allows me to stream content into the editor.
//   The user will push a button externally to start the stream, and this plugin is to replace the content
//   with the streamed content.
//   An important part of this is that the content should appear as though it is being typed by a user.
//   It should appear with like a grey background while its being typed, and then become the normal color
//   after it is complete.
//   There should be a cursor that moves as the content is being typed.

type Content =
	| string
	// biome-ignore lint/suspicious/noExplicitAny: needed for tiptap extension
	| Record<string, any>
	// biome-ignore lint/suspicious/noExplicitAny: needed for tiptap extension
	| (string | Record<string, any>)[]
	| ProseMirrorNode
	| Fragment;

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		streamContent: {
			/**
			 * Streams content into the editor, replacing the current selection or the entire document.
			 *
			 * @param newContent The content to stream.
			 * @param streamSpeed The speed of the typing animation in milliseconds per character.
			 */
			streamContent: (
				contentStream: ReadableStream,
				streamSpeed?: number,
				onFinish?: () => void,
			) => ReturnType;
		};
	}
}

interface StreamContentOptions {
	streamSpeed: number;
}

export const StreamContent = Extension.create<StreamContentOptions>({
	name: 'streamContentWithMark',

	addOptions() {
		return {
			streamSpeed: 50,
		};
	},

	onTransaction({ transaction }) {
		// This is a temporary debugging tool.
		// We want to find any transaction that changes the document but is NOT from our stream.
		if (transaction.getMeta('fromStreamContent')) {
			// This is our own transaction, which is expected.
			return;
		}
	},

	addExtensions() {
		// This extension now automatically includes the StreamingMark.
		// StreamingMark will use its own default options (e.g., for HTMLAttributes).
		// If you needed to pass specific configurations to StreamingMark from here,
		// you would do it in the configure() call, e.g. StreamingMark.configure({ someOption: value })
		return [StreamingMark.configure()];
	},

	addCommands() {
		return {
			// Note: The command itself is synchronous and returns true immediately.
			// The actual stream processing happens asynchronously.
			streamContent:
				(contentStream: ReadableStream<string>, streamSpeed?: number, onFinish?: () => void) =>
				({ editor, commands }) => {
					const speed = streamSpeed || this.options.streamSpeed;
					const markToApply = STREAMING_MARK_NAME;
					const { state } = editor;
					const currentDocSelection = state.selection;

					let insertionPoint: number;

					if (currentDocSelection.from !== currentDocSelection.to) {
						const rangeToDelete = { from: currentDocSelection.from, to: currentDocSelection.to };
						editor.chain().focus().deleteRange(rangeToDelete).run();
						insertionPoint = rangeToDelete.from;
					} else {
						editor.chain().focus().clearContent(true).run();
						insertionPoint = 0;
					}

					// Set initial cursor position synchronously
					editor.chain().setTextSelection(insertionPoint).run();
					const initialInsertPos = insertionPoint;

					// Define the async function to process the stream
					const processStream = async () => {
						const streamingMarkSchemaType = editor.schema.marks[markToApply];

						if (!streamingMarkSchemaType) {
							try {
								const readerForFallback = contentStream.getReader();
								let fullText = '';
								while (true) {
									const { done, value } = await readerForFallback.read();
									if (done) break;
									fullText += value;
								}
								if (fullText) {
									// Use editor.commands directly as `commands` from CommandProps might be stale.
									editor.commands.insertContentAt(initialInsertPos, fullText as Content);
								}
							} catch (error) {
								console.error('Error reading stream for fallback content insertion:', error);
							}
							return;
						}

						const reader = contentStream.getReader();

						try {
							while (true) {
								const { done, value } = await reader.read();
								if (done) {
									break;
								}

								const chunkText = value; // Assuming value is already a string chunk
								for (const char of chunkText) {
									if (!editor.isEditable) {
										reader
											.cancel('Editor not editable')
											.catch((e) => console.warn('Error cancelling reader:', e));
										return; // Exit async function
									}

									if (char === '\n') {
										// Handle newline by creating a new paragraph (or splitting the current block)
										editor.chain().focus().setMeta('fromStreamContent', true).splitBlock().run();
									} else {
										// Get the current cursor position from the editor state directly
										const currentPos = editor.state.selection.from;
										// Insert regular character at the true current position
										editor
											.chain()
											.setMeta('fromStreamContent', true) // Tag this transaction as our own
											.insertContentAt(currentPos, char as Content)
											.setTextSelection({ from: currentPos, to: currentPos + 1 })
											.setMark(markToApply)
											.setTextSelection(currentPos + 1) // Move cursor after the typed character
											.run();
									}

									if (speed > 0) {
										await new Promise((resolve) => setTimeout(resolve, speed));
									}
								}
							}
						} catch (error) {
							console.error('StreamContent: Error while reading or processing stream:', error);
						} finally {
							const finalPos = editor.state.selection.from;
							if (finalPos > initialInsertPos) {
								editor
									.chain()
									.setMeta('fromStreamContent', true) // Tag this final transaction too
									.setTextSelection({ from: initialInsertPos, to: finalPos })
									.unsetMark(markToApply)
									.setTextSelection(finalPos)
									.run();
							}
						}
					};

					// Start the async processing but don't await it in the command.
					processStream()
						.catch((error) => {
							console.error('StreamContent: Unhandled error in processStream:', error);
						})
						.finally(() => {
							onFinish?.();
						});

					return true;
				},
		};
	},
});
