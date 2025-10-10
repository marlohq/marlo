export const INBOX_LABEL_ID = 'INBOX';
export const SPAM_LABEL_ID = 'SPAM';
export const TRASH_LABEL_ID = 'TRASH';
export const UNREAD_LABEL_ID = 'UNREAD';
export const STARRED_LABEL_ID = 'STARRED';
export const IMPORTANT_LABEL_ID = 'IMPORTANT';
export const SENT_LABEL_ID = 'SENT';
export const DRAFT_LABEL_ID = 'DRAFT';

export const CATEGORY_PERSONAL = 'CATEGORY_PERSONAL';
export const CATEGORY_SOCIAL = 'CATEGORY_SOCIAL';
export const CATEGORY_PROMOTIONS = 'CATEGORY_PROMOTIONS';
export const CATEGORY_UPDATES = 'CATEGORY_UPDATES';
export const CATEGORY_FORUMS = 'CATEGORY_FORUMS';

// Not exhaustive, but these are the most common system labels used in Gmail.
// https://developers.google.com/workspace/gmail/api/guides/labels#types_of_labels
export const SYSTEM_LABEL_IDS = new Set([
	INBOX_LABEL_ID,
	SPAM_LABEL_ID,
	TRASH_LABEL_ID,
	UNREAD_LABEL_ID,
	STARRED_LABEL_ID,
	IMPORTANT_LABEL_ID,
	SENT_LABEL_ID,
	DRAFT_LABEL_ID,

	CATEGORY_PERSONAL,
	CATEGORY_SOCIAL,
	CATEGORY_PROMOTIONS,
	CATEGORY_UPDATES,
	CATEGORY_FORUMS,
]);
