import { useMutation } from '@tanstack/react-query';
import { createId } from '@workspace/core/util.js';
import type { DraftData, MessageData } from '@workspace/sync-data/data.js';
import { Button } from '@workspace/ui';
import { invariant } from 'es-toolkit';
import { useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { useCommandPaletteActions } from '../components/CommandPalette/context.tsx';
import { LinkPopover } from '../components/Composer/LinkPopover.tsx';
import {
	finalizeTipTapHtml,
	useComposerEditor,
} from '../components/Composer/MessageCardComposer.tsx';
import { StandaloneComposer } from '../components/Composer/StandaloneComposer.tsx';
import type { FormSchema } from '../components/Composer/util.ts';
import { useAutoSave, useDefaultSignature, useDraft } from '../hooks/draft.ts';
import { useComposerForm } from '../hooks/form.ts';
import { useCurrentAccount } from '../hooks/useCurrentAccount.tsx';
import { actions } from '../lib/actions.ts';
import { deleteDraft, getDeleteDraftPromises } from '../lib/draft.ts';
import { cn } from '../lib/util.ts';
import { createThread, deleteThread, updateMessage } from '../threads/mutations.ts';

export function Component() {
	const { draftId } = useParams();
	const { setPageContext } = useCommandPaletteActions();

	useEffect(() => {
		setPageContext({
			title: { text: 'Compose' },
			view: { type: 'root' },
		});
	}, [setPageContext]);

	const { signature, status: signatureStatus } = useDefaultSignature();

	// If we don't have a draftId, we need to create a new one.
	// In local-first applications, it's okay to create the ID locally
	// like this (as long as you follow our standard ULID format).
	if (!draftId) {
		const id = createId();
		return <Navigate to={`/compose/${id}`} />;
	}

	if (signatureStatus !== 'complete') {
		return null;
	}

	return <ComposeFormDraftLoader draftId={draftId} signature={signature} />;
}

function ComposeFormDraftLoader({ draftId, signature }: { draftId: string; signature?: string }) {
	const { draft, message, status, draftExists } = useDraft(draftId, signature);

	if (status !== 'complete' || draft == null) {
		return null;
	}

	return <ComposeForm draft={draft} message={message} draftExists={draftExists} />;
}

function ComposeForm({
	draft,
	message,
	draftExists,
}: {
	draft: DraftData;
	message: MessageData;
	draftExists: boolean;
}) {
	const account = useCurrentAccount();
	const { setPageContext } = useCommandPaletteActions();

	useEffect(() => {
		setPageContext({
			title: { text: 'Compose' },
			view: { type: 'root' },
		});
	}, [setPageContext]);

	const form = useComposerForm(message);
	const { saving, stopSaving } = useAutoSave({
		threadId: message.threadId,
		draftMessageId: message.id,
		form,
		draftExists,
		draft,
	});

	// Need the initial value to pass to the editor
	const initialBody = message.contentHtml ?? '';

	// Always want the up to date saved time.
	const lastSaved = message.updatedAt;
	const navigate = useNavigate();

	const sendMutation = useMutation<
		Awaited<ReturnType<typeof actions.messages.send>>,
		Error,
		FormSchema
	>({
		mutationFn: async (data) => {
			invariant(message, 'Message is not defined');

			stopSaving();
			deleteDraft(message.threadId, message.id);

			const id = createId();
			const sendAt = new Date(Date.now() + 10 * 1000);

			// Create the thread initially with optimistic data
			createThread({
				id,
				userId: account.userId,
				accountId: account.id,
				remoteId: `ZZ${id}`,
				category: null,
				spaceId: null,
				lastSentAt: sendAt,
				remindAt: null,
				reminderTriggeredAt: null,
				resolvedAt: new Date(),
				spammedAt: null,
				markedSafeAt: null,
				trashedAt: null,
				deletedAt: null,
				triagedAt: null,
				messages: [
					{
						id: id,
						remoteId: `ZZ${id}`,
						userId: account.userId,
						accountId: account.id,
						messageAttachments: [],
						contentHtml: data.body || '',
						contentText: data.body || '',
						draftId: null,
						messageLabels: [],
						readAt: new Date(),
						inReplyTo: message.inReplyTo,
						deletedAt: null,
						globalId: `ZZ${id}`,
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
						senderEmail: account.email,
						senderName: account.name,
						updatedAt: new Date(),
						sentAt: sendAt,
						snippet: data.subject,
						subject: data.subject || '',
						threadId: id,
					},
				],
			});

			// Navigate to the thread before sending to Gmail
			navigate(`/threads/${id}`);

			const result = await actions.messages.send({
				...data,
				insertedId: id,
				sendAt,
			});

			// Update the local message with the actual Gmail response data
			updateMessage(id, id, {
				senderEmail: result.senderMail,
				senderName: result.senderName,
				contentHtml: result.html,
				contentText: result.text,
			});

			return result;
		},
		onSuccess: async (data) => {
			toast.success('Message sent', {
				id: 'message-sent',
				duration: 10000,
				action: (
					<Button
						variant="ghost"
						size="sm"
						className="max-h-fit px-2 py-px"
						onClick={async () => {
							// TODO: If this fails, we should show an error message telling the user that the message could not be undone
							if (data.insertedId) {
								deleteThread(data.insertedId);
							}
							navigate(`/compose/${draft.id}`);
							toast.dismiss('message-sent');
						}}
					>
						Undo
					</Button>
				),
			});
		},
	});

	const { editor, linkPopover } = useComposerEditor({
		isActive: true,
		initialContent: initialBody,
		onSubmit: () => {
			sendMutation.mutate({
				...form.getValues(),
				body: finalizeTipTapHtml(form.getValues('body')),
			});
		},
		onUpdate: (html) => {
			form.setValue('body', html);
		},
	});

	return (
		<>
			<div className={cn('h-full w-full overflow-hidden')}>
				<div className="h-full w-full flex-1">
					<StandaloneComposer
						form={form}
						editor={editor}
						draftMessageId={message.id}
						onSubmit={(data) => sendMutation.mutate({ ...data, body: finalizeTipTapHtml(data.body || '') })}
						lastSaved={lastSaved ? new Date(lastSaved) : undefined}
						pending={sendMutation.isPending}
						saving={saving}
						onDelete={async () => {
							try {
								const { threadLocal: threadPromise } = await getDeleteDraftPromises(
									message.threadId,
									message.id,
								);

								// Wait for the thread to be deleted locally before navigating.
								await threadPromise;
							} catch (err: unknown) {
								const errorMessage =
									typeof err === 'object' && err != null && 'message' in err && err.message;
								if (errorMessage !== 'Thread not found') {
									toast.error(errorMessage?.toString() ?? 'Unknown error');
									navigate('/');
									return;
								}
								// Thread doesn't exist as draft, just proceed with navigation
							}

							// Navigate
							toast.success('Draft deleted!');
							navigate(`/`);
						}}
					/>
				</div>
			</div>

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
