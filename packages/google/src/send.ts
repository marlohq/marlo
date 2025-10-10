import { htmlToText } from 'html-to-text';
import { createMimeMessage } from 'mail-mime-builder';
import { queueSendEmail } from './mail-ingestion/send.js';

export interface EmailAddress {
	name?: string;
	addr: string;
}

export interface EmailMessage {
	to: EmailAddress[];
	from: EmailAddress;
	subject: string;
	cc?: EmailAddress[] | string;
	bcc?: EmailAddress[] | string;
	body?: string;
	headers?: Record<string, string>;
	attachments?: {
		filename: string;
		data: Buffer;
		contentType: string;
	}[];
}

function getEmailContent(body: string): { html: string; text: string } {
	const html = body;
	const text = htmlToText(body);
	return { html, text };
}

function convertToMimeMessage(email: EmailMessage, contentHTML: string, contentText: string) {
	const mime = createMimeMessage();
	mime.setTo(email.to);
	mime.setSender(email.from);
	mime.setSubject(email.subject);
	if (email.body) {
		mime.addMessage({
			contentType: 'text/html',
			data: contentHTML,
		});
		mime.addMessage({
			contentType: 'text/plain',
			data: contentText,
		});
	} else {
		mime.addMessage({
			contentType: 'text/plain',
			data: '',
		});
	}
	if (email.headers) {
		mime.setHeaders(email.headers);
	}
	if (email.cc) {
		mime.setCc(email.cc);
	}
	if (email.bcc) {
		mime.setBcc(email.bcc);
	}
	if (email.attachments) {
		for (const attachment of email.attachments) {
			mime.addAttachment({
				filename: attachment.filename,
				data: attachment.data.toString('base64'),
				contentType: attachment.contentType,
			});
		}
	}

	return mime;
}

export async function send({
	email,
	accountId,
	insertedId,
	sendAt,
	remoteThreadId,
	draftId,
}: {
	email: EmailMessage;
	accountId: string;
	insertedId?: string;
	draftId?: string;
	sendAt: Date;
	remoteThreadId?: string;
}) {
	const { html, text } = getEmailContent(email.body ?? '');
	const mime = convertToMimeMessage(email, html, text);

	// Create the raw mime email
	const raw = mime.asRaw();
	// Base64 encode it
	const encoded = Buffer.from(raw).toString('base64');

	await queueSendEmail({
		sendAt,
		accountId,
		messageId: insertedId,
		draftId,
		encoded,
		remoteThreadId,
	});

	return {
		senderMail: email.from.addr,
		senderName: email.from.name ?? null,
		html,
		text,
		insertedId,
	};
}
