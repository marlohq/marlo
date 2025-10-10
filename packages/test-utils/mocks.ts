import fs from 'node:fs/promises';
import type { GaxiosPromise, GaxiosResponse } from 'gaxios';
import type { gmail_v1 } from 'googleapis';
import { vi } from 'vitest';

const rawFolder = new URL('./fixtures/raws/', import.meta.url);
const historyFolder = new URL('./fixtures/history/', import.meta.url);

vi.mock('../google/src/request-client.ts', async () => {
	return {
		getGmailClientForAccount: async () => {
			return {
				client: true,
				error: null,
			};
		},
		isGaxiosError: (error: unknown): error is GaxiosResponse => {
			return false;
		},
	};
});

vi.mock('../google/src/mail-ingestion/gmail-calls.ts', async () => {
	return {
		getGmailMessage: async (_: gmail_v1.Gmail, remoteId: string) => {
			// Load the message from the local raw messages in fixtures/raws based on the remoteId.
			const raw = await fs.readFile(new URL(`${remoteId}.eml`, rawFolder), 'utf-8');

			// Encode to base64 to match the API response.
			const base64 = Buffer.from(raw).toString('base64');

			// trying reading a file called remoteId.labels.json in the same folder, ignore if it doesn't exist.
			const labels: string[] = JSON.parse(
				await fs.readFile(new URL(`${remoteId}.labels.json`, rawFolder), 'utf-8').catch(() => '[]'),
			);

			// If the remoteId is in a folder then the first part is the threadId.
			const threadId = remoteId.split('/')[0] ?? `thread-${remoteId}`;

			return {
				config: {},
				data: {
					id: remoteId,
					threadId,
					snippet: `snippet-${remoteId}`,
					raw: base64,
					labelIds: labels,
					internalDate: Date.now().toString(),
					// TODO: fill in the rest of the fields.
				},
				headers: {},
				status: 200,
				statusText: 'OK',
				request: {} as GaxiosResponse<gmail_v1.Schema$Message>['request'],
			} satisfies GaxiosResponse<gmail_v1.Schema$Message>;
		},
		listGmailLabels: async (
			_: gmail_v1.Gmail,
		): GaxiosPromise<gmail_v1.Schema$ListLabelsResponse> => {
			return {
				config: {},
				data: {
					labels: [
						...Array.from({ length: 5 }, (_, i) => ({
							id: `label-${i}`,
							name: `Label ${i}`,
							type: 'user',
							messageListVisibility: 'show',
							labelListVisibility: 'show',
						})),
					],
				},
				headers: {},
				status: 200,
				statusText: 'OK',
				request: {} as GaxiosResponse<gmail_v1.Schema$ListLabelsResponse>['request'],
			} satisfies GaxiosResponse<gmail_v1.Schema$ListLabelsResponse>;
		},
		listGmailHistory: async (
			_gmail: gmail_v1.Gmail,
			startHistoryId: string,
			_pageToken?: string,
		): GaxiosPromise<gmail_v1.Schema$ListHistoryResponse> => {
			let historyFile: string;
			try {
				historyFile = await fs.readFile(new URL(`${startHistoryId}.json`, historyFolder), 'utf-8');
			} catch (error) {
				console.warn(
					`History file not found for ${startHistoryId}, creating an empty one to avoid internal errors unrelated to the test.`,
				);

				historyFile = JSON.stringify({
					historyId: startHistoryId,
					history: [],
				});
			}

			const history = {
				...JSON.parse(historyFile),
				historyId: `${startHistoryId}`,
			} as gmail_v1.Schema$ListHistoryResponse;

			return {
				config: {},
				data: history,
				headers: {},
				status: 200,
				statusText: 'OK',
				request: {} as GaxiosResponse<gmail_v1.Schema$ListHistoryResponse>['request'],
			} satisfies GaxiosResponse<gmail_v1.Schema$ListHistoryResponse>;
		},
		listGmailDrafts: async (
			_gmail: gmail_v1.Gmail,
			_query: gmail_v1.Params$Resource$Users$Drafts$List,
		) => {
			return {
				config: {},
				data: {
					drafts: [],
				},
				headers: {},
				status: 200,
				statusText: 'OK',
				request: {} as GaxiosResponse<gmail_v1.Schema$ListDraftsResponse>['request'],
			} satisfies GaxiosResponse<gmail_v1.Schema$ListDraftsResponse>;
		},
		listGmailDraftsByMessageId: async () => {
			return {
				config: {},
				data: {
					drafts: [],
				},
				headers: {},
				status: 200,
				statusText: 'OK',
				request: {} as GaxiosResponse<gmail_v1.Schema$ListHistoryResponse>['request'],
			} satisfies GaxiosResponse<gmail_v1.Schema$ListDraftsResponse>;
		},
	};
});

vi.mock('../core/src/storage/storage.ts', async (importOriginal) => {
	const actual: typeof import('../core/src/storage/storage.ts') = await importOriginal();
	return {
		subfolderPath: actual.subfolderPath,
		getObjectResult: async (_filename: string) => {
			return null;
		},
		getObject: async (_filename: string) => {
			return null;
		},
		putObject: async (_filename: string, _data: Buffer) => {
			return {
				etag: 'etag',
				versionId: 'versionId',
			};
		},
		deleteObject: async (_filename: string) => {
			return {
				Deleted: [],
				Errors: [],
			};
		},
		deleteAllAccountObjects: async (_accountId: string) => {
			return {
				Deleted: [],
				Errors: [],
			};
		},
	};
});
