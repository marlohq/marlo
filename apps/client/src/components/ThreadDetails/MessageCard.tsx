import {
	RiArrowDropDownFill,
	RiAttachment2,
	RiCornerUpLeftDoubleLine,
	RiCornerUpLeftLine,
	RiCornerUpRightLine,
	RiMoreFill,
	RiUserFill,
} from '@remixicon/react';
import { prependBackendUrl } from '@workspace/core/url.ts';
import { useQuery } from '@workspace/local/query.ts';
import type { MessageData } from '@workspace/local/schema.js';
import type { ContactData } from '@workspace/sync-data/data.js';
import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@workspace/ui';
import { format } from 'date-fns';
import { invariant } from 'es-toolkit';
import { Fragment, useEffect, useRef, useState } from 'react';
import { getDefaultForwardFormData } from '../../commands/commands/forward.ts';
import { getDefaultReplyFormData } from '../../commands/commands/reply.ts';
import { getDefaultReplyAllFormData } from '../../commands/commands/replyAll.ts';
import { useCurrentAccount } from '../../hooks/useCurrentAccount.tsx';
import { type CategoryClientModule, getCategoryClientModule } from '../../lib/categories.ts';
import { createDraft, deleteDraft } from '../../lib/draft.ts';
import { useClickTimer } from '../../lib/timer.ts';
import { cn, formatShortDate, formatTimestamp } from '../../lib/util.ts';
import type { ClientMessage } from '../../models/message.ts';
import { useMessageContent } from '../../threads/hooks.ts';
import { MessageCardComposer } from '../Composer/MessageCardComposer.tsx';
import type { ComposerState } from '../Composer/util.ts';
import { ContactProfilePopover } from '../ContactProfilePopover.tsx';
import { CopyField } from '../CopyField.tsx';
import { ImageWithFallback } from '../ImageWithFallback.tsx';
import { QuoteExpando } from '../QuoteExpando.tsx';
import { ShadowMail } from '../Shadow.tsx';

export function MessageCard({
	ref: _ref,
	isLast,
	isFirst,
	message,
	defaultOpen = false,
	disableClose = false,
	isEmbedded = false,
	onExpand,
}: {
	ref?: React.RefObject<HTMLDetailsElement | null>;
	isLast?: boolean;
	isFirst?: boolean;
	message: ClientMessage;
	defaultOpen?: boolean;
	disableClose?: boolean;
	isEmbedded?: boolean;
	onExpand?: () => void;
}) {
	const currentAccount = useCurrentAccount();
	const replyDraftMessage = message.replyDraftMessages()[0];
	const bodyRef = useRef<HTMLDivElement>(null);
	const [sender] = useQuery(
		(db) => db.contacts.where('data.email').equals(message.data.senderEmail).first(),
		[message.data.senderEmail],
	);
	const [open, setOpen] = useState(defaultOpen || message.hasReplyDraft());
	const [draftMessage, setDraftMessage] = useState<MessageData | null>(replyDraftMessage ?? null);
	const [draftAction, setDraftAction] = useState<{
		action: 'reply' | 'reply-all' | 'forward';
	} | null>(null);
	const [composerState, setComposerState] = useState<ComposerState>({
		isExpanded: message.hasReplyDraft(),
	});
	const [isQuoteExpanded, setIsQuoteExpanded] = useState(false);
	const expandTimer = useClickTimer('message-card-expand');

	const expand = async (action: 'reply' | 'reply-all' | 'forward') => {
		expandTimer.startClick();

		// Expand the composer window immediately.
		setComposerState({ isExpanded: true });

		const replyDraftMessage = message.replyDraftMessages()[0];
		if (replyDraftMessage) {
			setDraftAction({ action });
			setDraftMessage(replyDraftMessage);
			setComposerState({ isExpanded: true });
			return;
		}
		const data =
			action === 'reply'
				? getDefaultReplyFormData(message.data)
				: action === 'reply-all'
					? getDefaultReplyAllFormData(message.data, currentAccount.email)
					: action === 'forward'
						? getDefaultForwardFormData(message.data)
						: null;
		invariant(data, 'Invalid new draft action');
		expandTimer.log('Creating draft');
		const { draftMessage } = await createDraft({
			account: currentAccount,
			data,
			parentThreadId: message.data.threadId,
			inReplyTo: message.data.globalId,
		});
		expandTimer.log('Draft created');
		setDraftAction({ action });
		setDraftMessage(draftMessage);
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally adding more triggers to re-run.
	useEffect(() => {
		if (!bodyRef.current || !onExpand) {
			return;
		}
		if (bodyRef.current.scrollWidth > bodyRef.current.clientWidth) {
			onExpand();
		}
	}, [bodyRef.current, onExpand, open, composerState.isExpanded, isQuoteExpanded]);

	return (
		<>
			{!open ? (
				<button
					type="button"
					className={cn('message-card w-full max-w-screen-md')}
					onClick={() => setOpen(true)}
				>
					<Summary message={message} sender={sender?.data} />
				</button>
			) : (
				<div className={cn('message-card w-full max-w-screen-md')}>
					<SummaryExpanded
						message={message}
						isEmbedded={isEmbedded}
						sender={sender?.data}
						onClose={disableClose || composerState.isExpanded ? undefined : () => setOpen(false)}
						onExpand={(action) => expand(action)}
					/>
					<div className="mx-auto flex max-w-screen-md flex-col">
						<Body
							message={message}
							ref={bodyRef}
							onQuoteToggle={(val) => setIsQuoteExpanded(val)}
							isFirst={isFirst}
						/>
						<Attachments message={message} />
						<div className="h-2" />
						{composerState.isExpanded && draftMessage && !isEmbedded && (
							<div className="p-8 pt-4">
								<div className="rounded-md shadow-md outline outline-1 outline-neutral-900/10">
									<MessageCardComposer
										message={message}
										draftMessage={draftMessage}
										recipientType={draftAction}
										isExpanded={composerState.isExpanded}
										lastSaved={draftMessage ? new Date(draftMessage.updatedAt) : undefined}
										onDelete={() => {
											invariant(draftMessage, 'Draft message is required');
											deleteDraft(draftMessage.threadId, draftMessage.id);
											setDraftMessage(null);
											setComposerState({
												...composerState,
												isExpanded: false,
											});
										}}
										onSend={() => {
											setComposerState({
												...composerState,
												isExpanded: false,
											});
										}}
									/>
								</div>
							</div>
						)}
						<div className="h-2" />
						{isLast && !composerState.isExpanded && (
							<footer className="flex items-start justify-start gap-2 px-8 text-neutral-500">
								{message.data.messageRecipients.length > 1 ? (
									<Button onClick={() => expand('reply-all')}>
										<RiCornerUpLeftDoubleLine className="size-4" aria-hidden />
										Reply All
									</Button>
								) : (
									<Button onClick={() => expand('reply')}>
										<RiCornerUpLeftLine className="size-4" aria-hidden />
										Reply
									</Button>
								)}
								<Button onClick={() => expand('forward')}>
									<RiCornerUpRightLine className="size-4" aria-hidden />
									Forward
								</Button>
							</footer>
						)}
						<div className="h-12" />
					</div>
				</div>
			)}
		</>
	);
}

function AvatarIcon({
	category,
	showCategoryIcon,
}: {
	category: CategoryClientModule | undefined;
	showCategoryIcon: boolean;
}) {
	return category && showCategoryIcon ? (
		<category.icon className="size-5 text-white" />
	) : (
		<RiUserFill className="size-5 text-white" />
	);
}

function Summary({ message, sender }: { message: ClientMessage; sender: ContactData | undefined }) {
	const categoryId = message.thread.data.category || undefined;
	const category = categoryId ? getCategoryClientModule(categoryId) : undefined;
	const isFirstMessage =
		message.thread.messages.find((m) => !m.draftId && !m.deletedAt)?.id === message.data.id;

	return (
		<div className="flex flex-col px-6 pb-2 pt-4">
			<div className="flex items-start justify-between gap-1 leading-none">
				<div className="mb-2 mr-2 flex size-[38px] items-center justify-center overflow-hidden rounded bg-blue-500">
					<ImageWithFallback
						src={undefined}
						alt=""
						className="size-full"
						fallback={
							<AvatarIcon
								category={category}
								showCategoryIcon={isFirstMessage && category?.id !== 'updates'}
							/>
						}
					/>
				</div>
				<div className="flex flex-1 flex-col gap-px truncate">
					<h3 className="flex w-full min-w-0 items-baseline justify-between gap-1.5">
						<ContactProfilePopover
							senderEmail={message.data.senderEmail}
							senderName={message.data.senderName}
						>
							<span className="min-w-0 shrink basis-[max-content] cursor-pointer truncate text-md font-semibold leading-tight text-neutral-800 hover:text-neutral-600">
								{message.data.senderName || message.data.senderEmail}
							</span>
						</ContactProfilePopover>
						<time
							className="min-w-0 truncate text-neutral-500"
							dateTime={new Date(message.data.sentAt).toISOString()}
						>
							{formatShortDate(new Date(message.data.sentAt))}
						</time>
					</h3>
					<div className="flex h-[18px] min-w-0 items-center gap-1 text-neutral-500">
						<span className="block w-full truncate">
							{message.data.snippet ||
								message.data.contentText?.replace(/\u200C/g, '').replace(/\s+/g, ' ')}
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

function SummaryExpanded({
	message,
	sender,
	isEmbedded,
	onExpand,
	onClose,
}: {
	message: ClientMessage;
	sender: ContactData | undefined;
	isEmbedded: boolean;
	onClose: (() => void) | undefined;
	onExpand: (action: 'reply' | 'reply-all' | 'forward') => void;
}) {
	const categoryId = message.thread.data.category || undefined;
	const category = categoryId ? getCategoryClientModule(categoryId) : undefined;
	const isFirstMessage =
		message.thread.messages.find((m) => !m.draftId && !m.deletedAt)?.id === message.data.id;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: This is intentionally mouse-only behavior, for now.
		// biome-ignore lint/a11y/useKeyWithClickEvents: This is intentionally mouse-only behavior, for now.
		<div
			className={cn('flex flex-col px-6 pb-2 pt-4', onClose && 'cursor-pointer')}
			onClick={onClose}
		>
			<div className="flex items-start justify-between gap-1 leading-none">
				<div className="mb-2 mr-2 flex size-[38px] items-center justify-center overflow-hidden rounded bg-blue-500">
					<ImageWithFallback
						src={undefined}
						alt=""
						className="size-full"
						fallback={
							<AvatarIcon
								category={category}
								showCategoryIcon={isFirstMessage && category?.id !== 'updates'}
							/>
						}
					/>
				</div>
				<div className="flex flex-1 flex-col gap-px truncate">
					<h3 className="flex min-w-0 items-baseline gap-1.5">
						<ContactProfilePopover
							senderEmail={message.data.senderEmail}
							senderName={message.data.senderName}
						>
							<span className="min-w-0 shrink basis-[max-content] cursor-pointer truncate text-md font-semibold leading-tight text-neutral-800 hover:text-neutral-600">
								{message.data.senderName || message.data.senderEmail}
							</span>
						</ContactProfilePopover>
						<span className="min-w-0 shrink-[99999] grow truncate text-neutral-500">{`${message.data.senderEmail}`}</span>
					</h3>
					<div className="flex shrink-0 flex-wrap items-center gap-x-1 text-neutral-500">
						<span>to</span>
						<DropdownMenu>
							<ToField recipients={message.data.messageRecipients} />
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" size={null} className="size-5 rounded-sm">
									<RiArrowDropDownFill className="size-5" aria-hidden />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent className="max-w-[460px]">
								<MessageDetails message={message} />
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>
				{!isEmbedded && (
					<div className="-mt-[2px] flex shrink-0 items-start gap-1">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									className="size-6 rounded p-0 text-neutral-500 data-[state=open]:bg-neutral-200 data-[state=open]:text-neutral-800"
								>
									<RiMoreFill className="size-4" aria-hidden />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="end"
								className="min-w-[200px]"
								onClick={(e) => e.stopPropagation()}
							>
								<DropdownMenuItem onSelect={() => onExpand('reply')}>
									<div className="px-1">
										<RiCornerUpLeftLine className="size-4" aria-hidden />
									</div>
									Reply
								</DropdownMenuItem>
								{message.data.messageRecipients.length > 1 && (
									<DropdownMenuItem onSelect={() => onExpand('reply-all')}>
										<div className="px-1">
											<RiCornerUpLeftDoubleLine className="size-4" aria-hidden />
										</div>
										Reply all
									</DropdownMenuItem>
								)}
								<DropdownMenuItem onSelect={() => onExpand('forward')}>
									<div className="px-1">
										<RiCornerUpRightLine className="size-4" aria-hidden />
									</div>
									Forward
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				)}
				<div className="flex shrink-0 items-start gap-1">
					<p className="shrink-0 pl-1 leading-5 text-neutral-500">
						<span className="sr-only">sent</span>
						<time dateTime={new Date(message.data.sentAt).toISOString()}>
							{isEmbedded
								? formatShortDate(new Date(message.data.sentAt))
								: formatTimestamp(new Date(message.data.sentAt))}
						</time>
					</p>
				</div>
			</div>
		</div>
	);
}

function CopyEmailAddress({ email, children }: { email: string; children: React.ReactNode }) {
	return (
		<CopyField text={email} copyLabel={`Copy email`}>
			{children}
		</CopyField>
	);
}

function ToField({
	recipients,
}: {
	recipients: MessageData['messageRecipients'];
}): React.ReactNode {
	const currentAccount = useCurrentAccount();
	const sortedRecipients = [...recipients].sort((a, b) => {
		// Return 'TO' first, then 'CC', then 'BCC'
		// This just happens to be the alphabetical order, so we can use localeCompare for this.
		if (a.type !== b.type) {
			return b.type.localeCompare(a.type);
		}
		// Prioritize names over emails, for a better presentation.
		if (a.name && !b.name) {
			return -1;
		}
		if (!a.name && b.name) {
			return 1;
		}
		// Lastly, sort by name/email alphabetically.
		return (a.name || a.email).localeCompare(b.name || b.email);
	});
	return sortedRecipients.reduce((acc, recipient, i) => {
		if (i > 3) {
			return acc;
		}
		if (i === 3) {
			const andOthersCount = sortedRecipients.length - i;
			acc.push(
				<Fragment key={i}>
					{'and '}
					<DropdownMenuTrigger asChild>
						<button type="button" className="hover:underline">
							{`${andOthersCount} ${andOthersCount === 1 ? 'other' : 'others'}`}
						</button>
					</DropdownMenuTrigger>
				</Fragment>,
			);
			return acc;
		}
		if (recipient.email === currentAccount.email) {
			acc.push(
				<span key={recipient.email}>
					{recipient.type === 'BCC' && 'bcc: '}
					{'me'}
					{i < sortedRecipients.length - 1 && ', '}
				</span>,
			);
			return acc;
		}
		acc.push(
			<span key={recipient.email}>
				{recipient.type === 'BCC' && 'bcc: '}
				<ContactProfilePopover senderEmail={recipient.email} senderName={recipient.name}>
					<CopyEmailAddress email={recipient.email}>
						<span className="cursor-pointer hover:text-neutral-600">
							{recipient.name || recipient.email}
						</span>
					</CopyEmailAddress>
				</ContactProfilePopover>
				{i < sortedRecipients.length - 1 && ', '}
			</span>,
		);
		return acc;
	}, [] as React.ReactNode[]);
}

function formatRecipient(recipient: MessageData['messageRecipients'][number]) {
	if (recipient.name && recipient.email) {
		return `${recipient.name} <${recipient.email}>`;
	}
	return recipient.email;
}

function RecipientWithPopover({
	recipient,
}: {
	recipient: MessageData['messageRecipients'][number];
}) {
	const displayText =
		recipient.name && recipient.email ? `${recipient.name} <${recipient.email}>` : recipient.email;

	return (
		<ContactProfilePopover senderEmail={recipient.email} senderName={recipient.name}>
			<span className="cursor-pointer hover:text-neutral-800">{displayText}</span>
		</ContactProfilePopover>
	);
}

function MessageDetails({ message }: { message: ClientMessage }) {
	const to = message.data.messageRecipients.filter((r) => r.type === 'TO');
	const cc = message.data.messageRecipients.filter((r) => r.type === 'CC');
	const bcc = message.data.messageRecipients.filter((r) => r.type === 'BCC');
	return (
		<dl className="grid grid-cols-[48px_1fr] gap-2 px-3 py-2 leading-relaxed text-neutral-900">
			<dt className="font-medium">From</dt>
			<dd className="break-words text-neutral-600">
				<ContactProfilePopover
					senderEmail={message.data.senderEmail}
					senderName={message.data.senderName}
				>
					<span className="cursor-pointer hover:text-neutral-800">
						{message.data.senderEmail || message.data.senderName || 'Unknown sender'}
					</span>
				</ContactProfilePopover>
			</dd>
			{to.length ? (
				<>
					{' '}
					<dt className="font-medium">To</dt>
					<dd className="overflow-hidden break-words text-neutral-600">
						{to.map((recipient, i) => (
							<Fragment key={recipient.email}>
								<RecipientWithPopover recipient={recipient} />
								{i < to.length - 1 && ', '}
							</Fragment>
						))}
					</dd>
				</>
			) : null}
			{cc.length ? (
				<>
					<dt className="font-medium">CC</dt>
					<dd className="overflow-hidden break-words text-neutral-600">
						{cc.map((recipient, i) => (
							<Fragment key={recipient.email}>
								<RecipientWithPopover recipient={recipient} />
								{i < cc.length - 1 && ', '}
							</Fragment>
						))}
					</dd>
				</>
			) : null}
			{bcc.length ? (
				<>
					<dt className="font-medium">BCC</dt>
					<dd className="overflow-hidden break-words text-neutral-600">
						{bcc.map((recipient, i) => (
							<Fragment key={recipient.email}>
								<RecipientWithPopover recipient={recipient} />
								{i < bcc.length - 1 && ', '}
							</Fragment>
						))}
					</dd>
				</>
			) : null}
			<dt className="font-medium">Date</dt>
			<dd className="break-all text-neutral-600">
				<time dateTime={new Date(message.data.sentAt).toISOString()}>
					{format(new Date(message.data.sentAt), "MMMM d, yyyy 'at' h:mm a")}
				</time>
			</dd>
		</dl>
	);
}

function Body({
	message,
	ref,
	onQuoteToggle,
	isFirst,
}: {
	message: ClientMessage;
	ref: React.RefObject<HTMLDivElement | null>;
	onQuoteToggle?: (val: boolean) => void;
	isFirst?: boolean;
}) {
	const { content, isLoading, error } = useMessageContent(message.data);
	if (isLoading) {
		return (
			<div className="overflow-auto px-4 text-center text-neutral-500 sm:px-8">
				<div className="animate-pulse">Loading message content...</div>
			</div>
		);
	}

	if (error || !content) {
		return (
			<div className="sm:4 overflow-auto px-4 text-center text-neutral-500">
				{error ? `Error loading content: ${error.message}` : 'No content available'}
			</div>
		);
	}

	const { quoteHTML, contentHTML } = parseHTML(content.html || content.text);
	return (
		<div className="overflow-auto px-4 sm:px-8" ref={ref}>
			<ShadowMail
				messageId={message.data.id}
				className={cn(content.html ? '' : 'whitespace-pre-wrap')}
				html={contentHTML}
			/>
			{quoteHTML && (
				<QuoteExpando onQuoteToggle={onQuoteToggle} open={isFirst ? true : undefined}>
					<ShadowMail messageId={message.data.id} className="mt-4" html={quoteHTML} />
				</QuoteExpando>
			)}
		</div>
	);
}

/**
 * Removes trailing <br> elements from an HTML element by recursively walking the DOM tree, starting
 * from the last child node and exiting once meaningful content is found. Return true if meaningful
 * content was found, false otherwise. Return value is used to manage recursion.
 */
function removeTrailingBrElements(element: Element): boolean {
	const childNodes = Array.from(element.childNodes);
	for (let i = childNodes.length - 1; i >= 0; i--) {
		const node = childNodes[i];
		// Skip if the node is not an element, just to be safe.
		if (!node) {
			continue;
		}
		// Remove <br> elements that appear at the end
		if (node.nodeName.toLowerCase() === 'br') {
			node.remove();
			continue;
		}
		if (node.nodeName.toLowerCase() === '#text' && node.textContent?.trim() === '') {
			node.remove();
			continue;
		}
		// Recursively process <div> elements, looking for <br> elements
		// that are nested inside of <div> elements but exiting the entire
		// process once meaningful content is found.
		if (node.nodeName.toLowerCase() === 'div') {
			const foundText = removeTrailingBrElements(node as Element);
			if (!foundText) {
				node.remove();
				continue;
			}
		}
		// If this line is reached, it means that we have found a meaningful content element.
		// Return true to tell the caller that it should stop removing elements as well.
		return true;
	}
	// If we get here, no meaningful content was found. Return false to tell the caller that it
	// is safe to continue removing elements.
	return false;
}

function parseHTML(html: string): { quoteHTML: string | undefined; contentHTML: string } {
	const parser = new DOMParser();
	const emailDoc = parser.parseFromString(html, 'text/html');
	if (!emailDoc.documentElement) return { quoteHTML: undefined, contentHTML: '' };

	let quoteHTML = '';
	const quoteElement = emailDoc.documentElement.querySelector('.gmail_quote');
	if (quoteElement) {
		quoteHTML += quoteElement.innerHTML;
		quoteElement.remove();
	}

	const signaturePrefixElement = emailDoc.documentElement.querySelector('.gmail_signature_prefix');
	if (signaturePrefixElement) {
		quoteHTML += `\n${signaturePrefixElement.innerHTML}`;
		signaturePrefixElement.remove();
	}

	const signatureElement = emailDoc.documentElement.querySelector('.gmail_signature');
	if (signatureElement) {
		quoteHTML += `\n${signatureElement.innerHTML}`;
		signatureElement.remove();
	}

	removeTrailingBrElements(emailDoc.documentElement.querySelector('body') as Element);

	const finalQuoteHTML = quoteHTML.trim();
	return {
		quoteHTML: finalQuoteHTML.length > 0 ? finalQuoteHTML : undefined,
		contentHTML: emailDoc.documentElement.innerHTML,
	};
}

function Attachments({ message }: { message: ClientMessage }) {
	const nonInlineAttachments = message.data.messageAttachments.filter(
		(attachment) => attachment.disposition !== 'inline',
	);
	if (nonInlineAttachments.length === 0) return null;
	return (
		<div className="flex flex-wrap items-center gap-2 px-8 pt-4">
			{nonInlineAttachments.map((attachment) => (
				<Button
					variant="outline"
					size="lg"
					key={attachment.id}
					asChild
					className="group h-8 max-w-full gap-1.5 border-neutral-300 bg-neutral-50 pl-2 pr-3 font-normal text-neutral-800 sm:max-w-[calc(50%-0.5rem)]"
				>
					<a
						target="_blank"
						rel="noopener noreferrer"
						href={prependBackendUrl(`/mail/attachments/${attachment.hash}`)}
					>
						<RiAttachment2 className="size-5 flex-shrink-0 text-neutral-600" aria-hidden />
						<span className="truncate">{attachment.filename}</span>
					</a>
				</Button>
			))}
		</div>
	);
}
