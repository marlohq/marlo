import { ORPCError, os } from '@orpc/server';
import { db, eq, type MCPServer, mcpServer } from '@workspace/core/drizzle.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import {
	createCustomServer,
	deleteServer as deleteMCPServer,
	getUserServers,
} from '@workspace/mcp/manager.js';
import type { APIContext } from 'astro';
import { z } from 'zod';
import { getActiveAccountOrThrow } from '../lib/auth.ts';

const defineORPCAction = os.$context<Pick<APIContext, 'locals' | 'cookies'>>();

const logger = baseLogger.child({ context: 'MCPServer' });

const MAX_SERVERS_PER_USER = 10;

export const actions = {
	getServers: defineORPCAction.input(z.object({})).handler(async ({ input, context }) => {
		const currentAccount = await getActiveAccountOrThrow(context);
		const servers = await getUserServers(currentAccount.userId);

		return {
			servers: servers.map((server: MCPServer) => ({
				id: server.id,
				name: server.name,
				status: server.status,
				lastError: server.lastError,
				createdAt: server.createdAt,
				updatedAt: server.updatedAt,
			})),
		};
	}),

	createCustomServer: defineORPCAction
		.input(
			z.object({
				name: z
					.string()
					.min(1, 'Server name is required')
					.max(100, 'Server name is too long (max 100 characters)')
					.regex(/^[a-zA-Z0-9\s\-_.]+$/, 'Server name contains invalid characters'),
				url: z
					.string()
					.url('Invalid URL format')
					.max(2048, 'URL is too long (max 2048 characters)'),
			}),
		)
		.handler(async ({ input, context }) => {
			const currentAccount = await getActiveAccountOrThrow(context);

			try {
				// Validate URL format and ensure HTTPS
				const parsedUrl = new URL(input.url);
				if (parsedUrl.protocol !== 'https:') {
					throw new ORPCError('BAD_REQUEST', {
						message: 'Only HTTPS URLs are allowed',
					});
				}

				// Block localhost and private networks for security
				if (
					parsedUrl.hostname === 'localhost' ||
					parsedUrl.hostname === '127.0.0.1' ||
					parsedUrl.hostname.startsWith('192.168.') ||
					parsedUrl.hostname.startsWith('10.') ||
					parsedUrl.hostname.startsWith('172.')
				) {
					throw new ORPCError('BAD_REQUEST', {
						message: 'Private network URLs are not allowed',
					});
				}

				// Check user doesn't have too many servers
				const existingCount = await db
					.select({ count: mcpServer.id })
					.from(mcpServer)
					.where(eq(mcpServer.userId, currentAccount.userId));

				if (existingCount.length >= MAX_SERVERS_PER_USER) {
					throw new ORPCError('CONFLICT', {
						message: 'Maximum of 10 custom MCP servers allowed per user',
					});
				}

				// Create custom MCP server using the new functional API
				const serverId = await createCustomServer(
					currentAccount.userId,
					currentAccount.id,
					input.name.trim(),
					input.url.trim(),
				);

				return { serverId };
			} catch (error) {
				if (error instanceof ORPCError) {
					throw error;
				}
				logger.error({ error }, 'Failed to create custom MCP server');
				throw new ORPCError('INTERNAL_SERVER_ERROR', {
					message: 'Failed to create custom MCP server',
				});
			}
		}),

	deleteServer: defineORPCAction
		.input(
			z.object({
				id: z.string().min(1, 'Server ID is required'),
			}),
		)
		.handler(async ({ input, context }) => {
			const currentAccount = await getActiveAccountOrThrow(context);

			try {
				// Verify the server belongs to the user and delete it
				await deleteMCPServer(currentAccount.userId, input.id);

				return { success: true };
			} catch (error) {
				if (error instanceof ORPCError) {
					throw error;
				}
				logger.error({ error }, 'Failed to delete MCP server');
				throw new ORPCError('INTERNAL_SERVER_ERROR', {
					message: 'Failed to delete MCP server',
				});
			}
		}),
};
