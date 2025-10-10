import { z } from 'zod';
import { INVALID_EMAIL_MESSAGE, validateEmail } from '../../lib/util.ts';

export type ComposerState = {
	isExpanded: boolean;
};

const recipientSchema = z.object({
	addr: z
		.string()
		.trim()
		.refine((email) => validateEmail(email), INVALID_EMAIL_MESSAGE),
	// Prefer null in the form to match DB, and map to undefined when sending
	name: z.string().nullable(),
});

export const formSchema = z.object({
	draftId: z.string().optional(),
	messageId: z.string().optional(),
	remoteThreadId: z.string().optional(),
	remoteMessageId: z.string().optional(),
	to: recipientSchema.array(),
	cc: recipientSchema.array(),
	bcc: recipientSchema.array(),
	subject: z.string(),
	body: z.string(),
	attachments: z.array(z.instanceof(File)),
});

export type FormSchema = z.infer<typeof formSchema>;
