import type { ThreadData } from '@workspace/local/schema.ts';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { isInputField, isKeyEventMatch } from '../commands/util.ts';
import { useCommandPalette } from '../components/CommandPalette/context.tsx';
import { useDocumentEventListener } from '../hooks/useDocumentEventListener.ts';
import { getThreadLink } from '../lib/util.ts';

/**
 * Hook that handles automatic navigation when thread state changes.
 *
 * Monitors changes to thread properties (resolvedAt, remindAt, spammedAt, trashedAt) and
 * automatically navigates back to the previous view when any of these properties change from null
 * to a value (indicating a "forward" action was taken).
 *
 * @param thread - The current thread data
 * @param navigationHistory - Navigation history from command palette context
 */
export function useThreadNavigation(thread: ThreadData | null) {
	const threadId = thread?.id;
	const { navigationHistory } = useCommandPalette();
	const navigate = useNavigate();
	const previousThreadStateRef = useRef<{
		threadId: string;
		isResolved: boolean;
		hasReminder: boolean;
		isSpammed: boolean;
		isTrashed: boolean;
	} | null>(null);

	useDocumentEventListener('keydown', (e: KeyboardEvent) => {
		if (!threadId) {
			return;
		}
		// Ignore navigation keys when typing in inputs or the composer editor
		if (isInputField(e)) {
			return;
		}
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			if (navigationHistory) {
				navigate(navigationHistory.to);
				return;
			}
			navigate('/');
			return;
		}
		if (isKeyEventMatch(e, { key: 'j', modifiers: [] }) && navigationHistory) {
			e.preventDefault();
			e.stopPropagation();
			const nextThreadId = navigationHistory.ids[navigationHistory.ids.indexOf(threadId) + 1];
			if (nextThreadId) {
				navigate(getThreadLink(nextThreadId));
			}
			return;
		}
		if (isKeyEventMatch(e, { key: 'k', modifiers: [] }) && navigationHistory) {
			e.preventDefault();
			e.stopPropagation();
			const prevThreadId = navigationHistory.ids[navigationHistory.ids.indexOf(threadId) - 1];
			if (prevThreadId) {
				navigate(getThreadLink(prevThreadId));
			}
			return;
		}
	});

	useEffect(() => {
		if (!thread || !navigationHistory) {
			return;
		}

		const currentState = {
			threadId: thread.id,
			isResolved: !!thread.resolvedAt,
			hasReminder: !!thread.remindAt,
			isSpammed: !!thread.spammedAt,
			isTrashed: !!thread.trashedAt,
		};

		const previousState = previousThreadStateRef.current;

		// Store current state for next comparison
		previousThreadStateRef.current = currentState;

		// Skip navigation on initial load (when previousState is null)
		if (!previousState || previousState.threadId !== thread.id) {
			return;
		}
		// Navigate back if any of the forward actions occurred
		if (
			(!previousState.isResolved && currentState.isResolved) ||
			(!previousState.hasReminder && currentState.hasReminder) ||
			(!previousState.isSpammed && currentState.isSpammed) ||
			(!previousState.isTrashed && currentState.isTrashed)
		) {
			navigate(navigationHistory.to);
		}
	}, [thread, navigationHistory, navigate]);
}
