import type { Account } from '@workspace/core/drizzle.js';
import type { MailInfo } from './ingest.ts';

export const checkShouldIncludeMessageContent = (mailInfo: MailInfo) => {
	return mailInfo.internalDate.getTime() > Date.now() - 365 * 24 * 60 * 60 * 1000; // One year
};

export const checkShouldTagMessage = (account: Account, mailInfo: MailInfo) => {
	return (
		mailInfo.fromEmail !== account.email &&
		// Tag messages if it was sent from midnight (UTC) at 2025-01-01 or newer
		mailInfo.internalDate.getTime() >= Date.UTC(2025, 0, 1, 0, 0, 0, 0)
	);
};

export const IGNORED_ADDRESSES = ['reminder@superhuman.com'];
