import type { Account } from '@workspace/core/drizzle.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import { tool } from 'ai';
import { z } from 'zod';

const logger = baseLogger.child({ namespace: 'ai/tools/notifications' });

/** Send notification tool - sends notifications for cron actions */
export function createSendNotificationTool(account: Account) {
	return tool({
		description:
			'Send a notification with information or a report. This is useful for scheduled automations that need to report results.',
		inputSchema: z.object({
			message: z.string().describe('The notification message to send'),
			subject: z.string().optional().describe('Optional subject for the notification'),
			type: z
				.enum(['info', 'success', 'warning', 'error'])
				.default('info')
				.describe('The type of notification'),
		}),
		execute: async ({ message, subject, type }) => {
			try {
				// For now, we'll just log the notification
				// In the future, this could send to Slack, email, etc.
				logger.info(
					{
						accountId: account.id,
						message,
						subject,
						type,
					},
					'Space Action notification',
				);

				return JSON.stringify({
					success: true,
					message: 'Notification sent successfully',
					notification: {
						subject: subject || 'Space Action Notification',
						message,
						type,
						timestamp: new Date().toISOString(),
					},
				});
			} catch (error) {
				logger.error(
					{
						accountId: account.id,
						message,
						subject,
						type,
						error,
					},
					'Failed to send notification',
				);

				return JSON.stringify({
					success: false,
					error: error instanceof Error ? error.message : 'Failed to send notification',
				});
			}
		},
	});
}
