import { createHash } from 'node:crypto';
import { deleteObject, getObject, putObject, subfolderPath } from './storage.ts';

const userPicturesFolder = subfolderPath('user-pictures');

export async function getUserPicture(userId: string, hash: string) {
	return getObject(userPicturesFolder(userId)(hash));
}

export async function uploadUserPicture(userId: string, hash: string, data: Buffer) {
	return putObject(userPicturesFolder(userId)(hash), data);
}

export async function deleteUserPicture(userId: string, hash: string) {
	return deleteObject(userPicturesFolder(userId)(hash));
}

export function createUserPictureHash(userId: string, accountId: string, pictureUrl: string) {
	return createHash('sha256').update(`${userId}:${accountId}:${pictureUrl}`).digest('hex');
}
