import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { handleAccountError } from '@workspace/core/auth-error.js';
import { prependBackendUrl } from '@workspace/core/url.js';
import type { RouterClient } from '../../../../apps/web/src/api/index.ts';

const link = new RPCLink({
	url: prependBackendUrl('/api/actions'),
	headers: {},
	fetch: async (request, init, options, path, input) => {
		const response = await fetch(request, init);

		// If account is in ERROR state, API returns 401. Handle logout and redirect.
		if (response.status === 401) {
			handleAccountError();
			// Return empty response to prevent further processing
			return new Response(null, { status: 401 });
		}

		return response;
	},
});

export const actions: RouterClient = createORPCClient(link);
