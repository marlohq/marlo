import type { Account } from '@workspace/core/drizzle.js';
import { logger } from '@workspace/core/logger.js';
import { getServerTools, getUserServers } from '@workspace/mcp/manager.js';
import type { ToolSet } from 'ai';

const mcpToolsLogger = logger.child({ context: 'MCPTools' });

/** Dynamically create MCP tools from all active servers for a user */
export async function createDynamicMCPTools(account: Account): Promise<ToolSet> {
	mcpToolsLogger.info({ userId: account.userId }, 'Starting dynamic MCP tools creation');

	try {
		// Get all active custom MCP servers for this user
		const activeServers = await getUserServers(account.userId);
		const activeCustomServers = activeServers.filter((server) => server.status === 'ACTIVE');

		mcpToolsLogger.info(
			{
				userId: account.userId,
				totalServers: activeServers.length,
				activeCustomServers: activeCustomServers.length,
				serverNames: activeCustomServers.map((s) => s.name),
			},
			'Found active custom MCP servers',
		);

		const allTools: ToolSet = {};

		// Load tools from each active custom server
		for (const server of activeCustomServers) {
			try {
				mcpToolsLogger.info(
					{
						userId: account.userId,
						serverId: server.id,
						serverName: server.name,
					},
					'Loading custom MCP server tools',
				);

				const tools = await getServerTools(server.id);

				// Merge tools with server name prefix to avoid conflicts
				const prefix = `${server.name.toLowerCase().replace(/\s+/g, '_')}_`;
				for (const [toolName, tool] of Object.entries(tools)) {
					allTools[`${prefix}${toolName}`] = tool;
				}

				mcpToolsLogger.info(
					{
						userId: account.userId,
						serverId: server.id,
						toolCount: Object.keys(tools).length,
					},
					'Successfully loaded tools from MCP server',
				);
			} catch (error) {
				mcpToolsLogger.error(
					{
						userId: account.userId,
						serverId: server.id,
						error,
					},
					'Failed to load tools from MCP server',
				);
				// Continue with other servers even if one fails
			}
		}

		mcpToolsLogger.info(
			{
				userId: account.userId,
				totalToolCount: Object.keys(allTools).length,
				toolNames: Object.keys(allTools),
			},
			'Dynamic MCP tools creation completed',
		);

		return allTools;
	} catch (error) {
		mcpToolsLogger.error({ userId: account.userId, error }, 'Failed to create dynamic MCP tools');
		return {};
	}
}
