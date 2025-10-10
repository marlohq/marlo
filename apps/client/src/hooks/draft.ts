import { createId } from '@workspace/core/util.js';
import { type QueryInfo, useQuery } from '@workspace/local/query.ts';
import type { DraftData, MessageData } from '@workspace/sync-data/data.ts';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type UseFormReturn, useWatch } from 'react-hook-form';
import type { FormSchema } from '../components/Composer/util.ts';
import { blankDraft, blankMessage, createDraftWithIds, saveDraft } from '../lib/draft.ts';
import { useCurrentAccount } from './useCurrentAccount.tsx';

export function useAutoSave({
	form,
	threadId,
	draftMessageId,
	draftExists,
	draft,
}: {
	threadId: string;
	draftMessageId?: string;
	form: UseFormReturn<FormSchema>;
	draftExists: boolean;
	draft?: DraftData;
}) {
	const account = useCurrentAccount();
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<Error | null>(null);
	const [hasCreatedDraft, setHasCreatedDraft] = useState(false);

	const watched = useWatch({
		control: form.control,
	});

	const saveController = useMemo(() => {
		return new AbortController();
	}, []);

	// Check if the user has made any meaningful changes
	const hasChanges = useMemo(() => {
		return Boolean(
			watched.subject?.trim() ||
				watched.body?.trim() ||
				watched.to?.length ||
				watched.cc?.length ||
				watched.bcc?.length ||
				watched.attachments?.length,
		);
	}, [watched]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: we only want this to run when the form changes
	useEffect(() => {
		if (draftMessageId && hasChanges) {
			const id = setTimeout(async () => {
				setSaving(true);
				try {
					// If draft doesn't exist in DB and we haven't created it yet, create it first
					if (!draftExists && !hasCreatedDraft && draft && draft.messageId) {
						await createDraftWithIds(account, draft.id, draft.messageId, threadId, {
							subject: watched.subject ?? '',
							attachments: watched.attachments ?? [],
							body: watched.body ?? '',
							cc: (watched.cc as FormSchema['cc']) ?? [],
							bcc: (watched.bcc as FormSchema['bcc']) ?? [],
							to: (watched.to as FormSchema['to']) ?? [],
						});
						setHasCreatedDraft(true);
					} else {
						// Draft exists, just update it
						await saveDraft(threadId, draftMessageId, account, {
							subject: watched.subject ?? '',
							attachments: watched.attachments ?? [],
							body: watched.body ?? '',
							cc: (watched.cc as FormSchema['cc']) ?? [],
							bcc: (watched.bcc as FormSchema['bcc']) ?? [],
							to: (watched.to as FormSchema['to']) ?? [],
						});
					}
				} catch (error) {
					setSaveError(error as Error);
				}
				setSaving(false);
			}, 1000);
			const clear = () => clearTimeout(id);
			saveController.signal.addEventListener('abort', clear, { once: true });
			return () => {
				clear();
				saveController.signal.removeEventListener('abort', clear);
			};
		}
	}, [watched, hasChanges]);

	const stopSaving = useCallback(() => {
		saveController.abort();
	}, [saveController]);

	return {
		saving,
		stopSaving,
		saveError,
	};
}

export function useDraft(draftId: string, signature?: string) {
	const account = useCurrentAccount();
	// Using a where query here so we know for sure that the draft is the one we want.
	const [data, draftInfo] = useQuery(
		(db) => db.drafts.where({ 'data.id': draftId }).toArray(),
		[draftId],
	);
	const threadId = data?.[0]?.data?.threadId ?? createId();
	const messageId = data?.[0]?.data?.messageId ?? createId();
	const draft = data?.[0]?.data ?? blankDraft(draftId, threadId, messageId);
	const [currentMessage, currentMessageInfo] = useDraftMessage(draft);
	const draftExists = data?.[0] != null;

	const status =
		draftInfo.status === 'error' || currentMessageInfo.status === 'error'
			? 'error'
			: draftInfo.status === 'complete' && currentMessageInfo.status === 'complete'
				? 'complete'
				: 'loading';

	return {
		draft,
		message: currentMessage ?? {
			...blankMessage(account, { threadId, draftId: draft.id }),
			id: messageId,
		},
		status: status,
		draftExists,
	};
}

export function useDefaultSignature() {
	const [signature, signatureInfo] = useQuery((db) => db.signatures.toArray());
	const defaultSignature = signature?.find((s) => s.data.default === true);

	const status =
		signatureInfo.status === 'error'
			? 'error'
			: signatureInfo.status === 'complete'
				? 'complete'
				: 'loading';
	return {
		signature: defaultSignature?.data.content ?? undefined,
		status,
	};
}

function useDraftMessage(draft: DraftData | null): [MessageData | null, QueryInfo] {
	const [threads, threadInfo] = useQuery(
		(db) => {
			if (!draft) return Promise.resolve(null);
			return db.threads.where({ 'data.id': draft.threadId }).toArray();
		},
		[draft?.threadId],
	);
	const thread = threads?.[0] ?? null;
	const message = thread?.data.messages.find((m) => m.id === draft?.messageId) ?? null;
	return [message, threadInfo];
}
