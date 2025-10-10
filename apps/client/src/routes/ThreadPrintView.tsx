import { useQuery } from '@workspace/local/query.ts';
import type { MessageData } from '@workspace/sync-data/data.js';
import { format } from 'date-fns';
import { useEffect, useRef } from 'react';
import { useParams } from 'react-router';
import { EmptyState } from '../components/EmptyState.tsx';
import { ShadowMail } from '../components/Shadow.tsx';
import { threadQuery } from '../lib/queries.ts';
import { cn } from '../lib/util.ts';
import { useMessageContent } from '../threads/hooks.ts';

export const READY_TO_PRINT_EVENT = 'READY_TO_PRINT';

export function Component() {
	const { threadId } = useParams() as { threadId: string };
	const [thread, info] = useQuery((db) => threadQuery(db, threadId).first());
	const timeoutRef = useRef<number | null>(null);
	useEffect(() => {
		if (info.status === 'complete') {
			timeoutRef.current = window.setTimeout(() => {
				window.parent.postMessage({ type: READY_TO_PRINT_EVENT }, '*');
				// Add timeout to wait for message images to load
				// TODO: investigate listening for message html load
			}, 500);
		}
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, [info.status]);

	if (!thread) {
		if (info.status === 'complete') {
			return <EmptyState message="No thread found." />;
		}
		return null;
	}
	const subject = thread.data.messages[0]?.subject;
	return (
		<main className="min-h-full bg-white">
			<h1 className="py-4 text-2xl font-bold">{subject}</h1>
			<hr className="mb-4" />
			{thread.data.messages
				// Zero query orderBy doesn't work for some reason
				.toSorted((a, b) => new Date(a.sentAt).valueOf() - new Date(b.sentAt).valueOf())
				.map((message, idx) => (
					<div key={message.id}>
						<MessageContent message={message} />
						{idx < thread.data.messages.length - 1 && <hr className="my-4" />}
					</div>
				))}
		</main>
	);
}

function MessageContent({ message }: { message: MessageData }) {
	const date = new Date(message.sentAt);
	const { content, isLoading, error } = useMessageContent(message);

	if (isLoading) {
		return <div>Loading...</div>;
	}

	if (error || !content) {
		return <div>Error loading message</div>;
	}

	return (
		<article>
			<header className="flex items-center gap-2">
				<h2 className="flex-1 truncate text-md font-semibold">{message.senderName}</h2>
				<p className="text-sm text-neutral-600">
					<time dateTime={date.toISOString()}>{format(date, "EEE, MMM d, yyyy 'at' h:mm a")}</time>
				</p>
			</header>
			<ShadowMail
				messageId={message.id}
				className={cn('w-full max-w-full', content.html ? '' : 'whitespace-pre-wrap')}
				html={content.html ?? content.text}
			/>
		</article>
	);
}
