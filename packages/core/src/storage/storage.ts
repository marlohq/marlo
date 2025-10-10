import {
	type _Error,
	DeleteObjectCommand,
	DeleteObjectsCommand,
	GetObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3';
import { env } from '../env.ts';

const client = new S3Client({
	region: 'us-west-2',
});

type Subfolder = 'attachments' | 'contact-pictures' | 'raw-messages' | 'user-pictures';
export const subfolderPath = (subfolder: Subfolder) => (accountId: string) => (item: string) =>
	`${accountId}/${subfolder}/${item}`;

export async function getObjectResult(filename: string) {
	const command = new GetObjectCommand({
		Bucket: env.require('BUCKET_NAME'),
		Key: filename,
	});
	return await client.send(command);
}

export async function getObject(filename: string) {
	const result = await getObjectResult(filename);
	return result.Body?.transformToWebStream();
}

export async function putObject(filename: string, data: Buffer, contentType?: string) {
	const command = new PutObjectCommand({
		Bucket: env.require('BUCKET_NAME'),
		Key: filename,
		Body: data,
		ContentType: contentType,
	});
	const result = await client.send(command);
	return {
		etag: result.ETag,
		versionId: result.VersionId,
	};
}

export async function deleteObject(filename: string) {
	const command = new DeleteObjectCommand({
		Bucket: env.require('BUCKET_NAME'),
		Key: filename,
	});
	const result = await client.send(command);
	return result;
}

export async function deleteAllAccountObjects(accountId: string) {
	const bucketName = env.require('BUCKET_NAME');
	const prefix = `${accountId}/`;
	let deletedCount = 0;
	let errors: _Error[] = [];
	let continuationToken: string | undefined;

	do {
		const query = {
			Bucket: bucketName,
			Prefix: prefix,
			ContinuationToken: continuationToken,
		};

		const listCommand: ListObjectsV2Command = new ListObjectsV2Command(query);
		const listedObjects = await client.send(listCommand);

		if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
			break;
		}

		const deleteCommand = new DeleteObjectsCommand({
			Bucket: bucketName,
			Delete: {
				Objects: listedObjects.Contents.map((object) => ({ Key: object.Key })),
			},
		});
		const deleteResult = await client.send(deleteCommand);

		deletedCount += deleteResult.Deleted?.length || 0;
		if (deleteResult.Errors) {
			errors = errors.concat(deleteResult.Errors);
		}

		continuationToken = listedObjects.NextContinuationToken;
	} while (continuationToken);

	return {
		deleted: deletedCount,
		errors,
	};
}
