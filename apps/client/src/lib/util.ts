import { prependBackendUrl } from '@workspace/core/url.ts';
import type { MessageData } from '@workspace/sync-data/data.js';
import { type ClassValue, clsx } from 'clsx';
import { addDays, isToday, subDays } from 'date-fns';
import { invariant, uniq } from 'es-toolkit';
import { twMerge } from 'tailwind-merge';
import isEmail from 'validator/lib/isEmail';

export const VIEWS = [
	{ name: 'All Mail', id: '', special: false },
	{ name: 'Reminders', id: 'has:reminder', special: true },
	{ name: 'Sent', id: 'in:sent', special: false },
	{ name: 'Drafts', id: 'in:draft', special: true },
	{ name: 'Spam', id: 'in:spam', special: false },
	{ name: 'Trash', id: 'in:trash', special: false },
];

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

function copyToClipboard(text: string) {
	const el = document.createElement('textarea');
	el.value = text;
	document.body.appendChild(el);
	el.select();
	document.execCommand('copy');
	document.body.removeChild(el);
}

function preloadImage(src: string) {
	new Image().src = src;
}

const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });
const shortDateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const longDateFormat = new Intl.DateTimeFormat(undefined, {
	month: 'long',
	day: 'numeric',
	year: 'numeric',
});

export function formatDateRange(from: Date, to: Date) {
	if (from.toDateString() === to.toDateString()) {
		return longDateFormat.format(from);
	}
	return longDateFormat.formatRange(from, to);
}

export function formatShortDate(date: Date) {
	if (isToday(date)) {
		return timeFormat.format(date);
	}
	const now = new Date();
	if (date.getFullYear() < now.getFullYear()) {
		return date.toLocaleDateString(undefined, {
			year: '2-digit',
			month: 'numeric',
			day: 'numeric',
		}); // 12/25/23
	}
	return shortDateFormat.format(date);
}

export function formatTimestamp(date: Date) {
	const now = new Date();
	const nowDateString = now.toDateString();
	const dateDateString = date.toDateString();
	// Special case (Today): "12:34 PM"
	if (nowDateString === dateDateString) {
		return timeFormat.format(date);
	}
	// Special case (Yesterday): "Yesterday, 12:34 PM"
	const yesterdayDateString = new Date(now.setDate(now.getDate() - 1)).toDateString();
	if (yesterdayDateString === dateDateString) {
		return `Yesterday, ${timeFormat.format(date)}`;
	}
	// Special case (Tomorrow): "Tomorrow, 12:34 PM"
	const tomorrowDateString = new Date(now.setDate(now.getDate() + 1)).toDateString();
	if (tomorrowDateString === dateDateString) {
		return `Tomorrow, ${timeFormat.format(date)}`;
	}
	// Special case (Within seven day window): "Monday, 12:34 PM"
	if (date > subDays(now, 7) && date < addDays(now, 7)) {
		return `${date.toLocaleDateString(undefined, { weekday: 'long' })}, ${timeFormat.format(date)}`;
	}
	// Otherwise, use a more condensed format, e.g. "04/26/25, 12:34 PM"
	return `${date.toLocaleDateString()} ${timeFormat.format(date)}`;
}

export const INVALID_EMAIL_MESSAGE = 'Please enter a valid email address';

export function validateEmail(email: string) {
	return isEmail(email);
}

// Parses strings like `email@example.com` and `Name <email@example.com>`.
const RECIPIENT_INPUT = /^\s*(?:([^<>]+?)\s*<([^<>]+[^<>]+)>|([^<>]+[^<>]+))\s*$/;

type RecipientInputMatch =
	// `email@example.com`.match(RECIPIENT_INPUT)
	| [string, undefined, undefined, string]
	// `Name <email@example.com>`.match(RECIPIENT_INPUT)
	| [string, string, string, undefined]
	// No match.
	| null;
/**
 * Parses strings like `email@example.com` and `Name <email@example.com>`. Returns null if it cannot
 * parse a valid email address.
 */
export function parseRecipientInput(input: string): { addr: string; name: string | null } | null {
	const trimmed = input.trim();
	const match = trimmed.match(RECIPIENT_INPUT) as RecipientInputMatch;
	if (!match || !match[0]) {
		return null;
	}
	if (match[1] && match[2] && validateEmail(match[2])) {
		const name = match[1].trim();
		const email = match[2].trim();
		if (validateEmail(email)) {
			return { addr: email, name: name || null };
		}
	}
	if (match[3] && validateEmail(match[3])) {
		return { addr: match[3], name: null };
	}
	return null;
}

function getSenderDomain(senderEmail: string) {
	const emailParts = senderEmail.split('@');
	const domain = emailParts.pop() || '';
	const domainParts = domain.split('.');

	// Handle special cases for domains like co.uk, com.au, etc.
	if (domainParts.length === 0) {
		return domain;
	}
	if (domainParts.length === 1) {
		return domain;
	}
	if (domainParts.length === 2) {
		return domain;
	}
	if (
		domainParts.length === 3 &&
		domainParts[1] &&
		domainParts[1].length <= 3 &&
		domainParts[2] &&
		domainParts[2].length <= 3
	) {
		return domain;
	}
	return domainParts.slice(-2).join('.');
}

export function getThreadLink(id: string) {
	return `/threads/${id}`;
}

function getDraftLink(id: string) {
	return `/compose/${id}`;
}

export function getSenderAvatarSrc(senderEmail: string) {
	let senderDomain = `${senderEmail.split('@').pop()}`;
	// e.g. mail.foo.bar.com -> bar.com
	if (!senderDomain.endsWith('.co.uk')) {
		const parts = senderDomain.split('.');
		senderDomain = parts.slice(-2).join('.');
	}
	const icon = prependBackendUrl(`/api/icons?domain=${senderDomain}`);
	return icon;
}

export function formatThreadFromField(
	messages: { senderName: string | null; senderEmail: string }[],
	currentUserEmail: string,
) {
	const from = [];
	for (const message of messages) {
		// Check if this is the current user
		if (message.senderEmail === currentUserEmail) {
			from.push('me');
		} else if (message.senderName) {
			from.push(message.senderName);
		} else {
			from.push(message.senderEmail);
		}
	}

	const fromUnique = uniq(from).filter(Boolean);
	invariant(fromUnique[0], 'No message senders found.');

	if (fromUnique.length === 1) {
		return fromUnique[0];
	}
	if (fromUnique.length < 4) {
		return fromUnique.map((name) => (name === 'me' ? 'me' : name.split(' ')[0])).join(', ');
	}
	const firstSender = fromUnique[0] === 'me' ? 'me' : fromUnique[0].split(' ')[0];
	const secondSender = fromUnique.at(-1) === 'me' ? 'me' : fromUnique.at(-1)?.split(' ')[0];
	const thirdSender = fromUnique.at(-2) === 'me' ? 'me' : fromUnique.at(-2)?.split(' ')[0];
	return `${firstSender} .. ${thirdSender}, ${secondSender}`;
}

export function formatCurrency(amount: number, currency: string) {
	const normalizedCurrency = currency.toUpperCase();
	// Attempt #1: Use the provided currency code.
	try {
		return new Intl.NumberFormat(undefined, {
			style: 'currency',
			currency: normalizedCurrency,
			minimumFractionDigits: 0,
		}).format(amount / 100);
	} catch {}
	// Attempt #2: Fall back to USD.
	try {
		return new Intl.NumberFormat(undefined, {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 0,
		}).format(amount / 100);
	} catch {}
	// Attempt #3: Fall back to plain number with $ symbol.
	return `$${(amount / 100).toLocaleString()}`;
}

export function getFirstOpenedMessageIndex(messages: readonly MessageData[]) {
	const result = messages.findIndex((message) => !message.readAt);
	if (result >= 0) {
		return result;
	}
	return messages.length - 1;
}

// Returns a display name for a space, falling back when empty/whitespace
export function getSpaceDisplayName(name: string): string {
	if (name === '') {
		return 'Untitled Space';
	}
	return name;
}
