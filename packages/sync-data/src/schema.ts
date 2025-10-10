export interface TableDifferences {
	added: string[];
	removed: string[];
}

export interface SchemaDifferences {
	[k: string]: TableDifferences;
}

export type SyncableTable =
	| 'Account'
	| 'Thread'
	| 'Contact'
	| 'Label'
	| 'Draft'
	| 'Signature'
	| 'ChatConversation'
	| 'Space';

export type ClientSyncState = {
	[K in SyncableTable]?: {
		version?: string;
		schemaChanges: TableDifferences;
	};
};
