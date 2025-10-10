import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { HonoAdapter } from '@bull-board/hono';
import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { serveStatic } from '@hono/node-server/serve-static';
import { contactIngestionQueue } from '@workspace/core/contacts.js';
import { captureException } from '@workspace/core/instrument.js';
import { logger } from '@workspace/core/logger.js';
import {
	actionQueue,
	aiQueue,
	filterForSpaceQueue,
	mailProcessQueue,
	propertyEvaluationQueue,
	syncActionToRemoteQueue,
} from '@workspace/core/queues.js';
import {
	historyUpdateQueue,
	queueHistoryRefresh,
} from '@workspace/google/mail-ingestion/history.js';
import { sendEmailQueue } from '@workspace/google/mail-ingestion/send.js';
import { handleGoogleWebhook } from '@workspace/google/mail-ingestion/webhook.js';
import { invariant } from 'es-toolkit';
import { Hono, type MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { spaceActionsCronQueue } from '../cron/space-actions.js';
import { BULL_BOARD_PASSWORD, BULL_BOARD_USERNAME } from '../env.js';
import { cronQueue } from '../workers/cron/queue.js';
import { refreshProfilesQueue } from '../workers/cron/refresh-profiles.js';
import { refreshAccountWatchQueue } from '../workers/cron/refresh-watch.js';
import { handleRemindersQueue } from '../workers/cron/reminders.js';
import { historyUpdateLabelChanges, historyUpdateMessageChanges } from '../workers/history.js';
import {
	authenticateUser,
	createSession,
	generateSessionToken,
	validateSessionToken,
} from './auth.js';

const app = new Hono();

app.post('/webhooks/google', async (c) => {
	try {
		const message = await handleGoogleWebhook(c.req.raw);

		logger.info(
			{ emailAddress: message.emailAddress, historyId: message.historyId },
			'Received Google webhook, queuing history refresh for user',
		);

		await queueHistoryRefresh(message.emailAddress);

		return new Response(null, { status: 200 });
	} catch (error) {
		captureException({ error }, 'Failed to handle Google webhook');
		return c.text('Internal Server Error', 500);
	}
});

// Admin dashboard - only enable if credentials are provided
const bullBoardEnabled = BULL_BOARD_USERNAME && BULL_BOARD_PASSWORD;

if (bullBoardEnabled) {
	const serverAdapter = new HonoAdapter(serveStatic);
	serverAdapter.setBasePath('/dashboard');

	// Create auth middleware for Bull Board
	const bullBoardAuth: MiddlewareHandler = async (c, next) => {
		if (c.req.path.startsWith('/dashboard/login') || c.req.path.startsWith('/dashboard/logout')) {
			return next();
		}

		// Check for auth cookie
		const sessionToken = getCookie(c, 'session_token');
		if (!sessionToken) {
			return c.redirect(`/dashboard/login?redirect=${encodeURIComponent(c.req.url)}`);
		}

		// Validate the session
		const session = await validateSessionToken(sessionToken);
		if (!session) {
			return c.redirect(`/dashboard/login?redirect=${encodeURIComponent(c.req.url)}`);
		}

		// Continue to Bull Board if authenticated
		await next();
	};

	function setupBullMQAdapterPro(queue: unknown): BullMQAdapter {
		// biome-ignore lint/suspicious/noExplicitAny: Bullboard does not support BullMQ Pro queues types
		return new BullMQAdapter(queue as any);
	}

	createBullBoard({
		queues: [
			setupBullMQAdapterPro(mailProcessQueue),
			setupBullMQAdapterPro(aiQueue),
			setupBullMQAdapterPro(actionQueue),
			setupBullMQAdapterPro(sendEmailQueue),
			setupBullMQAdapterPro(cronQueue),
			setupBullMQAdapterPro(spaceActionsCronQueue),
			setupBullMQAdapterPro(refreshProfilesQueue),
			setupBullMQAdapterPro(refreshAccountWatchQueue),
			setupBullMQAdapterPro(handleRemindersQueue),
			setupBullMQAdapterPro(historyUpdateQueue),
			setupBullMQAdapterPro(historyUpdateMessageChanges),
			setupBullMQAdapterPro(historyUpdateLabelChanges),
			setupBullMQAdapterPro(syncActionToRemoteQueue),
			setupBullMQAdapterPro(contactIngestionQueue),
			setupBullMQAdapterPro(filterForSpaceQueue),
			setupBullMQAdapterPro(propertyEvaluationQueue),
		],
		serverAdapter,
	});

	// Apply auth middleware to all dashboard routes
	app.use('/dashboard/*', bullBoardAuth);

	// biome-ignore lint/suspicious/noExplicitAny: Hono / Bullboard type issue causes TypeScript to slow down a lot
	app.route('/dashboard/', (serverAdapter as any).registerPlugin());

	app.get('/dashboard/login', async (c) => {
		const redirect = c.req.query('redirect') || '/dashboard/';
		return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Login</title>
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
				* { box-sizing: border-box; }
          body { font-family: system-ui, sans-serif; max-width: 400px; margin: 0 auto; padding: 2rem; }
          form { display: flex; flex-direction: column; gap: 1rem; }
				label { font-weight: bold; margin-bottom: 0.5rem; display: inline-block; }
          input { padding: 0.5rem; width: 100%; }
          button { padding: 0.5rem; cursor: pointer; width: 100%; }
        </style>
      </head>
      <body>
        <form method="POST" action="/dashboard/login">
          <input type="hidden" name="redirect" value="${redirect}">
          <div>
            <label for="username">Username</label>
            <input type="text" id="username" name="username" required>
          </div>
          <div>
            <label for="password">Password</label>
            <input type="password" id="password" name="password" required>
          </div>
          <button type="submit">Login</button>
        </form>
      </body>
    </html>
  `);
	});

	// Login form submission handler
	app.post('/dashboard/login', async (c) => {
		try {
			const formData = await c.req.formData();
			const username = formData.get('username')?.toString();
			const password = formData.get('password')?.toString();
			const redirect = formData.get('redirect')?.toString() || '/dashboard/';

			if (!username || !password) {
				return c.html(
					`
        <p>Missing username or password</p>
        <a href="/dashboard/login">Try again</a>
      `,
					400,
				);
			}

			// Authenticate user (replace with your actual authentication logic)
			const info = getConnInfo(c);

			invariant(info.remote, 'Remote info is not available');
			invariant(info.remote.address, 'Remote address is not available');

			const userId = await authenticateUser(username, password, info.remote.address);

			if (!userId) {
				return c.html(
					`
        <p>Invalid username or password</p>
        <a href="/dashboard/login">Try again</a>
      `,
					401,
				);
			}

			// Create session and set cookie
			const sessionToken = generateSessionToken();
			await createSession(sessionToken, userId);

			// Set session cookie
			setCookie(c, 'session_token', sessionToken, {
				httpOnly: true,
				secure: process.env.NODE_ENV === 'production',
				sameSite: 'lax',
				maxAge: 30 * 24 * 60 * 60, // 30 days
				path: '/',
			});

			// Redirect to the original destination
			return c.redirect(redirect);
		} catch (error) {
			captureException({ error }, 'Login error');
			return c.text('Login error', 500);
		}
	});

	// Add a logout route
	app.get('/dashboard/logout', async (c) => {
		// Clear the session cookie
		setCookie(c, 'session_token', '', {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			maxAge: 0,
			path: '/',
		});

		return c.redirect('/dashboard/login');
	});
}

app.get('/health', (c) => {
	return c.text('OK', 200);
});

export const server = serve({
	fetch: app.fetch,
	port: process.env.PORT ? Number(process.env.PORT) : 3002,
});
