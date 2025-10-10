import {
	type AddressObject,
	type HeaderValue,
	type Attachment as MailParserAttachment,
	type ParsedMail,
	simpleParser,
} from 'mailparser';
import type { MessageRecipientType } from './drizzle.ts';

export type Mail = SanitizedMail;
export type MailAttachement = MailParserAttachment;
export type MailHeaders = Record<string, HeaderValue>;
export type MailAddressObject = AddressObject;

export async function parseMail(encoded: string): Promise<Mail> {
	const raw = Buffer.from(encoded, 'base64').toString('utf-8');
	return await parseMailDecoded(raw);
}

export async function parseMailDecoded(raw: string): Promise<Mail> {
	return sanitizeMail(
		await simpleParser(raw, {
			keepCidLinks: true,
		}),
	);
}

export type Recipient = {
	type: MessageRecipientType;
	address: string;
	name?: string;
};

type SanitizedMail = Omit<ParsedMail, 'html' | 'to' | 'cc' | 'bcc' | 'replyTo' | 'headers'> & {
	html?: string | undefined; // Mailparser's is really weird and return false instead of undefined if the HTML is missing, awkward
	to: Recipient[];
	cc: Recipient[];
	bcc: Recipient[];
	replyTo?: AddressObject[] | undefined;
	headers: Record<string, HeaderValue>;
};

function sanitizeMail(mail: ParsedMail) {
	return {
		...mail,
		subject: mail.subject ? removeNullBytes(mail.subject) : undefined,
		html: mail.html ? removeNullBytes(mail.html) : undefined,
		text: mail.text ? removeNullBytes(mail.text) : undefined,
		to: parseRecipients(normalizeRecipients(mail.to), 'TO'),
		cc: parseRecipients(normalizeRecipients(mail.cc), 'CC'),
		bcc: parseRecipients(normalizeRecipients(mail.bcc), 'BCC'),
		replyTo: normalizeRecipients(mail.replyTo),
		headers: Object.fromEntries(mail.headers),
	};

	// Emails can contain null bytes, mostly in the content of the email. This is typically fine,
	// but Postgres doesn't accept null bytes in strings, and certain JS functions will also sometimes trip over them.
	function removeNullBytes(str: string): string {
		return str.replaceAll(/\0/g, '');
	}
}

function normalizeRecipients(recipients: ParsedMail['to'] | ParsedMail['cc'] | ParsedMail['bcc']) {
	return recipients ? (Array.isArray(recipients) ? recipients : [recipients]) : undefined;
}

function parseRecipients(
	recipients: MailAddressObject[] | undefined,
	type: MessageRecipientType,
): Recipient[] {
	if (!recipients || recipients.length === 0) {
		return [];
	}
	return recipients
		.flatMap((recipient) => recipient.value)
		.filter((contact): contact is typeof contact & { address: string } => Boolean(contact?.address))
		.map((contact) => ({
			name: contact.name,
			address: contact.address,
			type,
		}));
}
