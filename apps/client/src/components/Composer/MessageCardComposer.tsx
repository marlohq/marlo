import { useMutation } from '@tanstack/react-query';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import Typography from '@tiptap/extension-typography';
import { Placeholder } from '@tiptap/extensions';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { createId } from '@workspace/core/util.js';
import type { MessageData } from '@workspace/sync-data/data.ts';
import { Button } from '@workspace/ui';
import { invariant } from 'es-toolkit';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { getDefaultForwardRecipients } from '../../commands/commands/forward.ts';
import { getDefaultReplyRecipients } from '../../commands/commands/reply.ts';
import { getDefaultReplyAllRecipients } from '../../commands/commands/replyAll.ts';
import { useAttachments } from '../../hooks/attachments.ts';
import { useAutoSave } from '../../hooks/draft.ts';
import { useEnhance } from '../../hooks/enhance.ts';
import { useComposerForm } from '../../hooks/form.ts';
import { useCurrentAccount } from '../../hooks/useCurrentAccount.tsx';
import { actions } from '../../lib/actions.ts';
import { deleteDraft } from '../../lib/draft.ts';
import { cn } from '../../lib/util.ts';
import type { ClientMessage } from '../../models/message.ts';
import { createMessage, deleteMessage, updateMessage } from '../../threads/mutations.ts';
import { QuoteChip } from '../QuoteExpando.tsx';
import { BulletListNoDash } from './BulletListNoDash.ts';
import { ComposerFooter } from './Composer.tsx';
import { ComposerToolbar } from './ComposerTools.tsx';
import EditorWindow from './EditorWindow.tsx';
import { EmbeddedHTML } from './EmbeddedHTML.ts';
import { LinkPopover, useLinkPopover } from './LinkPopover.tsx';
import { RecipientFields } from './RecipientFields.tsx';
import { StreamContent } from './StreamContent.ts';
import { useQuote } from './useQuote.ts';
import type { FormSchema } from './util.ts';

function getGroupedRecipients(recipients: MessageData['messageRecipients']) {
	return recipients.reduce(
		(acc, r) => {
			acc[r.type] = [...(acc[r.type] ?? []), { addr: r.email, name: r.name }];
			return acc;
		},
		{} as Record<
			MessageData['messageRecipients'][number]['type'],
			{ addr: string; name: string | null }[]
		>,
	);
}

export function finalizeTipTapHtml(html: string): string {
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, 'text/html');
	const paragraphs = doc.querySelectorAll('p');
	paragraphs.forEach((p) => {
		if (p.closest('.gmail_quote')) return;
		if (p.closest('.gmail_signature')) return;
		const div = doc.createElement('div');
		// Copy attributes
		for (const attr of Array.from(p.attributes)) {
			div.setAttribute(attr.name, attr.value);
		}
		// Move children
		while (p.firstChild) {
			div.appendChild(p.firstChild);
		}
		// Preserve visual blank lines in email
		const isEffectivelyEmpty =
			div.childNodes.length === 0 ||
			(div.childNodes.length === 1 &&
				div.firstChild?.nodeType === Node.TEXT_NODE &&
				/^\s*$/.test(div.firstChild.textContent || ''));
		if (isEffectivelyEmpty) {
			div.textContent = '';
			div.appendChild(doc.createElement('br'));
		}
		// Replace paragraph with the new div element
		p.replaceWith(div);
	});
	const transformedHtml = doc.body.innerHTML;
	return transformedHtml;
}

export function useComposerEditor({
	className,
	isActive,
	initialContent,
	placeholder = 'Write your message...',
	onSubmit,
	onUpdate,
}: {
	className?: string;
	isActive: boolean;
	initialContent: string;
	placeholder?: string;
	onSubmit: () => void;
	onUpdate: (html: string) => void;
}) {
	const editor = useEditor(
		{
			immediatelyRender: true,
			extensions: [
				StarterKit.configure({
					bulletList: false,
					link: {
						openOnClick: false, // Prevent default link opening behavior
						HTMLAttributes: {
							class: 'text-blue-600 hover:text-blue-800 underline cursor-pointer',
						},
					},
				}),
				BulletListNoDash,
				TableKit.configure({}),
				Image,
				StreamContent,
				EmbeddedHTML,
				Placeholder.configure({ placeholder }),
				Typography.configure({
					oneHalf: false,
					oneQuarter: false,
					threeQuarters: false,
					ellipsis: false,
				}),
			],
			content: initialContent,
			editorProps: {
				attributes: {
					class: cn('max-w-full p-4 text-base composer-editor prose-editor', className),
				},
				handleKeyDown: (_view, event) => {
					if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
						event.preventDefault();
						onSubmit();
					}
				},
				handleDOMEvents: {
					focus: () => {
						if (!isActive) return;
					},
				},
			},
			onUpdate: ({ editor }) => {
				const html = editor.getHTML();
				onUpdate(html);
			},
		},
		[],
	);

	const linkPopover = useLinkPopover(editor);

	return {
		editor,
		linkPopover,
	};
}

function useMessageCardComposerEditor({
	message,
	placeholder,
	draftMessage,
	className,
	isActive,
	onSend,
}: {
	message: ClientMessage;
	placeholder?: string;
	draftMessage?: MessageData;
	className?: string;
	isActive: boolean;
	onSend?: () => void;
}) {
	const form = useComposerForm();
	const currentAccount = useCurrentAccount();

	// Analyze draft body vs expected Gmail quote using TipTap normalization
	const {
		initialEditorContent,
		initialFormBody,
		quoteChipVisible,
		onEditorUpdate,
		insertQuoteAtEnd,
	} = useQuote({
		messageData: message.data,
		draftContentHtml: draftMessage?.contentHtml ?? undefined,
	});

	const { editor, linkPopover } = useComposerEditor({
		className,
		isActive,
		placeholder,
		initialContent: initialEditorContent,
		onSubmit: () => {
			onSubmit(message.data.id, {
				...form.getValues(),
				body: finalizeTipTapHtml(form.getValues('body')),
			});
		},
		onUpdate: (html) => {
			const finalHtml = onEditorUpdate(html);
			form.setValue('body', finalHtml);
		},
	});

	// Ensure initial body mirrors stored draft semantics
	// biome-ignore lint/correctness/useExhaustiveDependencies: run once to seed form body from initial analysis
	useEffect(() => {
		form.setValue('body', initialFormBody);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const {
		enhance,
		state: enhanceState,
		enhancingEnabled,
	} = useEnhance({
		editor,
		draftMessageId: draftMessage?.id,
	});

	const sendMutation = useMutation<
		Awaited<ReturnType<typeof actions.messages.send>>,
		Error,
		FormSchema
	>({
		mutationKey: ['thread', 'send'],
		mutationFn: async (data) => {
			invariant(draftMessage, 'Draft message is required');

			// Close composer immediately when user clicks send
			onSend?.();

			const id = createId();
			const sendAt = new Date(Date.now() + 10 * 1000);

			// Step 1: Immediately create the local message with optimistic data
			// We'll use the user's email from currentAccount for sender info temporarily
			const optimisticMessage = {
				userId: message.data.userId,
				accountId: message.data.accountId,
				id,
				remoteId: `ZZ${id}`,
				messageAttachments: [],
				contentHtml: data.body || '', // Use the raw body HTML temporarily
				contentText: data.body?.replace(/<[^>]*>/g, '').trim() || '', // Simple HTML strip for optimistic update
				draftId: null,
				updatedAt: new Date(),
				threadId: message.data.threadId,
				subject: data.subject || '',
				messageLabels: [],
				readAt: new Date(),
				inReplyTo: message.data.globalId,
				globalId: `ZZ${id}`,
				deletedAt: null,
				messageRecipients: [
					...data.cc.map((r) => ({
						id: createId(),
						email: r.addr,
						name: r.name,
						type: 'CC' as const,
					})),
					...data.bcc.map((r) => ({
						id: createId(),
						email: r.addr,
						name: r.name,
						type: 'BCC' as const,
					})),
					...data.to.map((r) => ({
						id: createId(),
						email: r.addr,
						name: r.name,
						type: 'TO' as const,
					})),
				],
				senderEmail: currentAccount.email, // Use current account email temporarily
				senderName: currentAccount.name, // Use current account name temporarily
				sentAt: sendAt,
				snippet: data.subject,
			};

			// Step 2: Create local message and delete draft in parallel
			await Promise.all([
				createMessage(message.data.threadId, optimisticMessage),
				deleteDraft(message.data.threadId, draftMessage.id),
			]);

			// Step 3: Send to Gmail API (this happens after local save)
			const result = await actions.messages.send({
				...data,
				insertedId: id,
				draftId: data.draftId ?? '',
				sendAt,
			});

			// Step 4: Update the local message with the actual Gmail response data
			await updateMessage(message.data.threadId, id, {
				contentHtml: result.html,
				contentText: result.text,
				senderEmail: result.senderMail,
				senderName: result.senderName,
			});

			return result;
		},
		onSuccess: (data) => {
			toast.success('Message sent', {
				id: 'message-sent',
				duration: 10000,
				action: (
					<Button
						variant="ghost"
						size="sm"
						className="max-h-fit px-2 py-px"
						onClick={async () => {
							if (data.insertedId) {
								deleteMessage(message.data.threadId, data.insertedId);
							}
							toast.dismiss('message-sent');
						}}
					>
						Undo
					</Button>
				),
			});
		},
		onError: (error) => {
			console.error(error);
			toast.error('Failed to send message');
		},
	});

	function onSubmit(messageId: string, data: FormSchema) {
		sendMutation.mutate({
			messageId,
			to: data.to,
			cc: data.cc,
			bcc: data.bcc,
			body: finalizeTipTapHtml(data.body || ''),
			subject: data.subject,
			attachments: data.attachments,
		});
	}

	return {
		editor,
		onSubmit,
		isSubmitPending: sendMutation.isPending,
		form,
		enhance,
		enhancingEnabled,
		enhanceState,
		quoteChipVisible,
		insertQuoteAtEnd,
		linkPopover,
	};
}

export function MessageCardComposer({
	isExpanded,
	recipientType,
	draftMessage,
	message,
	onDelete,
	onSend,
	lastSaved,
}: {
	isExpanded: boolean;
	// NOTE(fks): We use an object here intentionally. This lets the consumer pass in a new `receiptType` object with the same `action` value,
	// which would trigger a re-render of the component and allow any useEffect() calls to run. I don't love relying on this as a side-effect,
	// but it's the best way to trigger this behavior from the parent without forcing us to refactor the component as a controlled component.
	recipientType: { action: 'reply' | 'reply-all' | 'forward' } | null;
	draftMessage: MessageData;
	message: ClientMessage;
	onDelete: () => void;
	onSend?: () => void;
	lastSaved: Date | undefined;
}) {
	const currentAccount = useCurrentAccount();
	const {
		form,
		editor,
		onSubmit,
		isSubmitPending,
		enhance,
		enhancingEnabled,
		enhanceState,
		quoteChipVisible,
		insertQuoteAtEnd,
		linkPopover,
	} = useMessageCardComposerEditor({
		isActive: isExpanded,
		message,
		draftMessage,
		className: ' min-h-32',
		onSend,
	});

	const { saving, stopSaving } = useAutoSave({
		threadId: message.data.threadId,
		draftMessageId: draftMessage.id,
		form,
		draftExists: true, // For replies, draft is created when user clicks Reply/Forward
		draft: {
			id: draftMessage.draftId as string,
			messageId: draftMessage.id,
			threadId: draftMessage.threadId,
			remoteId: '',
			deletedAt: null,
		},
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: Only need to run this when the composer state changes.
	useEffect(() => {
		switch (recipientType?.action) {
			case 'reply': {
				const recipients = getDefaultReplyRecipients(message.data);
				form.setValue('to', recipients.to);
				form.setValue('cc', recipients.cc);
				form.setValue('bcc', recipients.bcc);
				if (
					form.getValues('subject') === '' ||
					form.getValues('subject').endsWith(message.data.subject)
				) {
					form.setValue('subject', `Re: ${message.data.subject.replace(/^Re:\s*/, '')}`);
				}
				editor.commands.focus();
				break;
			}
			case 'reply-all': {
				const recipients = getDefaultReplyAllRecipients(message.data, currentAccount.email);
				form.setValue('to', recipients.to);
				form.setValue('cc', recipients.cc);
				form.setValue('bcc', recipients.bcc);
				if (
					form.getValues('subject') === '' ||
					form.getValues('subject').endsWith(message.data.subject)
				) {
					form.setValue('subject', `Re: ${message.data.subject.replace(/^Re:\s*/, '')}`);
				}
				editor.commands.focus();
				break;
			}
			case 'forward': {
				const recipients = getDefaultForwardRecipients();
				form.setValue('to', recipients.to);
				form.setValue('cc', recipients.cc);
				form.setValue('bcc', recipients.bcc);
				form.setFocus('to');
				if (
					form.getValues('subject') === '' ||
					form.getValues('subject').endsWith(message.data.subject)
				) {
					form.setValue('subject', `Fwd: ${message.data.subject}`);
				}
				break;
			}
			default: {
				const groupedRecipients = getGroupedRecipients(draftMessage.messageRecipients);
				form.setValue('to', groupedRecipients.TO);
				form.setValue('cc', groupedRecipients.CC);
				form.setValue('bcc', groupedRecipients.BCC);
				form.setValue('subject', draftMessage.subject);
				// Body is managed by editor onUpdate
				editor.commands.focus();
				return;
			}
		}
	}, [recipientType, isExpanded]);

	const { files, addFiles, removeFile, exceedsSizeLimit } = useAttachments({ form });
	return (
		<>
			<form
				onSubmit={form.handleSubmit((values) => {
					stopSaving();
					onSubmit(message.data.id, values);
				})}
			>
				<div className="flex w-full border-b border-neutral-200">
					<RecipientFields form={form} />
				</div>
				<div className="order-1 border-b border-neutral-200">
					<ComposerToolbar editor={editor} className="flex-1" attachmentButtonPlacement="left" />
				</div>
				<EditorWindow
					editor={editor}
					files={files}
					removeFile={removeFile}
					handleFileChange={addFiles}
					className="order-2"
				/>
				{quoteChipVisible && (
					<div className="px-4 py-2">
						<button type="button" onClick={() => insertQuoteAtEnd(editor)}>
							<QuoteChip />
						</button>
					</div>
				)}
				<ComposerFooter
					pending={isSubmitPending}
					sendDisabled={exceedsSizeLimit}
					enhanceDisabled={!enhancingEnabled}
					enhanceState={enhanceState}
					lastSaved={lastSaved}
					exceedsSizeLimit={exceedsSizeLimit}
					saving={saving}
					onEnhance={enhance}
					onDelete={onDelete}
					handleFileChange={addFiles}
				/>
			</form>

			{/* Link Popover */}
			<LinkPopover
				isOpen={linkPopover.popoverState.isOpen}
				url={linkPopover.popoverState.url}
				position={linkPopover.popoverState.position}
				onRemoveLink={linkPopover.removeLink}
				onClose={linkPopover.closePopover}
			/>
		</>
	);
}
