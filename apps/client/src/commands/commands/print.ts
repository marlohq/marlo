import { RiPrinterLine } from '@remixicon/react';
import { toast } from 'sonner';
import { READY_TO_PRINT_EVENT } from '../../routes/ThreadPrintView.tsx';
import type { ClientThread } from '../../threads/model.ts';
import { defineCommand, useThreadsFromContext } from '../util.ts';

export const printCommand = defineCommand({
	shortcut: { key: 'p', modifiers: ['CommandOrControl'], global: true },
	icon: RiPrinterLine,
	useAction() {
		const contextThreads = useThreadsFromContext();
		return (inlineThreads?: ClientThread[]) => {
			return {
				label: (): string => {
					return 'Print';
				},
				shouldHandle: () => {
					// If there are no threads, fall back to browser native print.
					return !!(inlineThreads ?? contextThreads)?.[0];
				},
				run: async (): Promise<void> => {
					const threads = inlineThreads ?? contextThreads ?? [];
					const thread = threads[0];
					if (!thread) return;
					const iframe = document.createElement('iframe');
					iframe.style.position = 'absolute';
					iframe.style.left = '-9999px'; // Move off-screen
					iframe.src = `/threads/${thread.id}/print`;
					document.body.appendChild(iframe);

					const abortController = new AbortController();
					await new Promise((resolve, reject) => {
						const failureTimeout = window.setTimeout(() => {
							reject(new Error('Printing failed'));
						}, 10_000);
						window.addEventListener(
							'message',
							(event) => {
								if (event.data?.type === READY_TO_PRINT_EVENT) {
									setTimeout(() => {
										// print blocks the main thread.
										// queue with small timeout to
										// let loading states resolve.
										iframe.contentWindow?.print();
										iframe.remove();
										abortController.abort();
									}, 1);
									window.clearTimeout(failureTimeout);
									resolve(void 0);
								}
							},
							{ signal: abortController.signal },
						);
					}).catch(() => {
						toast.error('Failed to create a print preview for this thread. Please try again.');
					});
				},
			};
		};
	},
});

export default printCommand;
