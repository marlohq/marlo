import type { RouterClient as ORPCRouterClient } from '@orpc/server';
import { actions as authActions } from './auth.ts';
import { actions as googleActions } from './google.ts';
import { actions as inboxActions } from './inbox.ts';
import { actions as mcpActions } from './mcp.ts';
import { actions as messageActions } from './messages.ts';
import { actions as spacesActions } from './spaces.ts';
import { actions as threadActions } from './threads.ts';
import { actions as userActions } from './user.ts';

export const router = {
	auth: authActions,
	threads: threadActions,
	messages: messageActions,
	google: googleActions,
	user: userActions,
	inbox: inboxActions,
	mcp: mcpActions,
	spaces: spacesActions,
};

export type RouterClient = ORPCRouterClient<typeof router>;
