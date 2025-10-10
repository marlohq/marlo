import { RiCheckLine, RiExternalLinkLine, RiFileCopyLine } from '@remixicon/react';
import type { AuthenticationCategoryProperties } from '@workspace/categories/types.js';
import { useSyncedThreads } from '@workspace/local/hooks/useSyncedThreads.ts';
import type { ThreadData } from '@workspace/sync-data/data.js';
import { Button, Dialog, DialogContent } from '@workspace/ui';
import { invariant } from 'es-toolkit';
import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { useLocalStorage } from 'usehooks-ts';
import { useCurrentAccount } from '../hooks/useCurrentAccount.tsx';
import { cn, formatThreadFromField, getSenderAvatarSrc } from '../lib/util.ts';
import { ClientThread } from '../threads/model.ts';
import { setResolved } from '../threads/mutations.ts';
import type { CommandPaletteView } from './CommandPalette/context.tsx';
import { ImageWithFallback } from './ImageWithFallback.tsx';

const INIT_TIMESTAMP = Date.now();

export function SecurityDialogManager() {
	// We store the handled thread IDs in local storage to support the concept of "dismissing" a dialog,
	// or "doing nothing", and preventing the thread from re-appearing immediately after a user has dismissed it.
	const [handledThreadIds, setHandledThreadIds] = useLocalStorage<string[]>(
		'securityDialog:handledThreads',
		[],
	);

	const [securityThread, setSecurityThread] = useState<ThreadData | null>(null);

	useSyncedThreads(
		(threads) => {
			// Process immediately, even during initial sync
			const relevantThreads = threads.filter((thread) => {
				if (thread.category !== 'authentication') return false;
				if (handledThreadIds.includes(thread.id)) return false;
				if (thread.resolvedAt !== null) return false;

				const authData = thread.categoryProperties?.[0] as AuthenticationCategoryProperties;
				if (!authData) return false;

				const isCode = authData.code !== undefined;
				const isLink = authData.link !== undefined;
				const isRelevantType =
					authData.verificationType === '2FA' ||
					authData.verificationType === 'PASSWORDLESS_LOGIN' ||
					authData.verificationType === 'PASSWORD_RESET';
				if (!(isRelevantType || isCode || isLink)) return false;
				if (new Date(thread.lastSentAt) < new Date(INIT_TIMESTAMP - 1000 * 60)) return false;
				if (new Date(thread.lastSentAt) > new Date(Date.now() - 1000 * 60 * 10)) return false;

				return true;
			});

			if (relevantThreads.length > 0) {
				setSecurityThread(relevantThreads[0] || null);
			}
		},
		[handledThreadIds],
	);

	const threadData = securityThread;

	const markHandled = useCallback(() => {
		const threadId = threadData?.id;
		invariant(threadId, 'Thread ID is required');
		setHandledThreadIds((prev) => (prev.includes(threadId) ? prev : [...prev, threadId]));
		setSecurityThread(null); // Clear the current thread
	}, [setHandledThreadIds, threadData?.id]);

	if (!threadData) {
		return null;
	}

	return (
		<SecurityDialog
			thread={new ClientThread(threadData)}
			open={!!threadData.id && !handledThreadIds.includes(threadData.id)}
			onOpenChange={(next) => {
				if (!next) {
					markHandled();
				}
			}}
			onHandled={markHandled}
		/>
	);
}

function getDomain(u: string) {
	try {
		const hostname = new URL(u).hostname;
		return hostname.replace(/^www\./, '');
	} catch {
		return u;
	}
}

function getActionText({ verificationType }: AuthenticationCategoryProperties) {
	switch (verificationType) {
		case '2FA':
			return 'just sent a 2FA verification code.';
		case 'PASSWORDLESS_LOGIN':
			return 'just sent a sign-in link.';
		case 'PASSWORD_RESET':
			return 'just sent a password reset code or link.';
		case 'LOGIN_NOTIFICATION':
			return 'just notified of a recent login to your account.';
		default:
			return 'just sent a security alert.';
	}
}

function getThreadHeaderText({ verificationType }: AuthenticationCategoryProperties) {
	switch (verificationType) {
		case '2FA':
		case 'PASSWORDLESS_LOGIN':
		case 'LOGIN_NOTIFICATION':
			return 'New Login Detected';
		case 'PASSWORD_RESET':
			return 'Password Reset Requested';
		default:
			return 'Security Alert';
	}
}

function SecurityDialog({
	thread,
	open = true,
	onOpenChange,
	onHandled,
}: {
	thread: ClientThread;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	onHandled?: () => void;
}) {
	const currentAccount = useCurrentAccount();
	const authData: AuthenticationCategoryProperties = {
		verificationType: 'UNKNOWN',
		...thread.getCategoryProperties('authentication'),
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) {
					onHandled?.();
				}
				onOpenChange?.(next);
			}}
		>
			<DialogContent
				hideCloseButton={true}
				className="gap-0 overflow-hidden bg-neutral-100 p-0 shadow-2xl"
				offset="top"
				data-current-context={JSON.stringify({
					type: 'thread',
					ids: [thread.id],
				} as CommandPaletteView)}
			>
				{/* Header */}
				<header className="px-16 pb-2.5 pt-16">
					<h2 className="leading-none text-neutral-500">{getThreadHeaderText(authData)}</h2>
				</header>

				{/* Email Preview */}
				<section className="border-b border-neutral-300 px-16 pb-16">
					<Link
						to={`/threads/${thread.id}`}
						onClick={onHandled}
						className="flex w-full items-center gap-3 rounded-md bg-white p-3 text-left shadow-md outline outline-neutral-900/25 transition-shadow hover:shadow-neutral-900/20"
					>
						<ImageWithFallback
							className="size-12 rounded-full bg-neutral-200"
							src={getSenderAvatarSrc(thread.messages[0].senderEmail)}
							alt=""
							fallback={<div className="size-12 rounded-full bg-neutral-300" />}
						/>
						<div className="min-w-0 flex-1">
							<h3 className="line-clamp-1 font-medium text-neutral-700">
								{`${formatThreadFromField(thread.messages, currentAccount.email)}: ${thread.subject}`}
							</h3>
							<p className="line-clamp-2 leading-tight text-neutral-500">{thread.snippet}</p>
						</div>
					</Link>
				</section>

				{/* Content */}
				<div className="bg-white px-5 pb-5 pt-5">
					<p className="text-balance text-neutral-500">
						<span className="font-medium text-neutral-700">
							{`${thread.messages[0].senderName} <${thread.messages[0].senderEmail}> `}
						</span>
						{getActionText(authData)} If you don't recognize this activity, open the thread to
						review. Be cautious of potential phishing attempts.
					</p>

					{/* Actions */}
					<div className="mt-4 flex gap-2">
						{authData.code && (
							<Button
								className="justify-start bg-blue-600 text-left text-white hover:bg-blue-700"
								onClick={async () => {
									if (!authData.code) return;
									try {
										await navigator.clipboard.writeText(authData.code);
									} catch {
										// no-op
									}
								}}
								title="Copy verification code"
							>
								<RiFileCopyLine size={16} />
								<span className="mr-4 flex-1">Copy code</span>
								<span className="max-w-[8rem] truncate font-mono text-sm font-normal text-white/80">
									{authData.code}
								</span>
							</Button>
						)}
						{authData.link && (
							<Button
								className="justify-start bg-blue-600 text-left text-white hover:bg-blue-700"
								onClick={() => {
									try {
										window.open(authData.link, '_blank', 'noopener,noreferrer');
									} catch {
										// no-op
									}
								}}
								title={authData.link}
							>
								<RiExternalLinkLine size={16} />
								<span className="mr-4 max-w-[14rem] flex-1 truncate">
									{authData.linkText || 'Open Link'}
								</span>
								<span className="max-w-[8rem] truncate text-sm font-normal text-white/80">
									{getDomain(authData.link)}
								</span>
							</Button>
						)}
						<Button
							onClick={() => {
								setResolved([thread.data], true);
								onHandled?.();
							}}
							className={cn(
								'justify-start text-left shadow-sm',
								!authData.link && !authData.code && 'bg-blue-600 text-white hover:bg-blue-700',
							)}
						>
							<RiCheckLine size={16} />
							<span className="flex-1">Resolve</span>
						</Button>
						<Button
							className="justify-start text-left shadow-sm"
							onClick={() => {
								onHandled?.();
							}}
						>
							<span className="flex-1">Do nothing</span>
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
