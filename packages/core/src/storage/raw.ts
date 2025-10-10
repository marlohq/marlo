import { deleteObject, getObject, putObject, subfolderPath } from './storage.js';

const rawMessagesFolder = subfolderPath('raw-messages');

export async function getMessage(accountId: string, remoteId: string) {
	return getObject(rawMessagesFolder(accountId)(remoteId));
}

export async function uploadMessage(accountId: string, remoteId: string, data: Buffer) {
	return putObject(rawMessagesFolder(accountId)(remoteId), data);
}

export async function deleteMessage(accountId: string, remoteId: string) {
	return deleteObject(rawMessagesFolder(accountId)(remoteId));
}
