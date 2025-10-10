import { createHash } from 'node:crypto';
import { deleteObject, getObject, getObjectResult, putObject, subfolderPath } from './storage.js';

const attachmentsFolder = subfolderPath('attachments');

export function createAttachmentHash(userId: string, messageRemoteId: string, contentId: string) {
	// These three values are required to guarantee uniqueness.
	return createHash('sha256').update(`${userId}:${messageRemoteId}:${contentId}`).digest('hex');
}

export async function getAttachment(accountId: string, hash: string) {
	return getObject(attachmentsFolder(accountId)(hash));
}

export async function getAttachmentResult(accountId: string, hash: string) {
	return getObjectResult(attachmentsFolder(accountId)(hash));
}

export async function uploadAttachment(
	accountId: string,
	hash: string,
	data: Buffer,
	contentType: string,
) {
	return putObject(attachmentsFolder(accountId)(hash), data, contentType);
}

export async function deleteAttachment(accountId: string, hash: string) {
	return deleteObject(attachmentsFolder(accountId)(hash));
}
