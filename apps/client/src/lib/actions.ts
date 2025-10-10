import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { prependBackendUrl } from '@workspace/core/url.js';
import type { RouterClient } from '../../../../apps/web/src/api/index.ts';

const link = new RPCLink({
	url: prependBackendUrl('/api/actions'),
	headers: {},
});

export const actions: RouterClient = createORPCClient(link);
