import type { ThreadData } from '@workspace/sync-data/data.js';
import type { ThreadSchema } from '../schema.ts';
import { getThreadHasDraft, getThreadView } from './view.ts';

export default {
	objectStore: 'threads',
	table: 'Thread',
	createObject(data: ThreadData): ThreadSchema {
		return {
			view: getThreadView(data),
			hasDraft: getThreadHasDraft(data),
			data,
		};
	},
} as const;
