import type { Account } from '@workspace/core/drizzle.js';
import type { GmailClient } from '@workspace/google/request-client.js';
import type { Tool, ToolSet } from 'ai';
import { createDraftTool } from './drafts.js';
import { createGetThreadDetailsTool, createSearchTool } from './email.js';
import { createDynamicMCPTools } from './mcp-tools-dynamic.js';
import { createSendNotificationTool } from './notifications.js';
import { createResolveThreadTool } from './threads.js';

export type { Tool };

export interface ToolRegistry {
	// Core email tools
	search: ReturnType<typeof createSearchTool>;
	get_thread_details: ReturnType<typeof createGetThreadDetailsTool>;

	// Draft tools
	createDraft: ReturnType<typeof createDraftTool>;

	// Thread management tools
	resolveThread: ReturnType<typeof createResolveThreadTool>;

	// Notification tools
	sendNotification: ReturnType<typeof createSendNotificationTool>;

	// MCP tools (loaded dynamically)
	[mcpToolName: string]: Tool;
}

export const TOOL_CATEGORIES = {
	email: ['search', 'get_thread_details'],
	drafts: ['createDraft'],
	thread_management: ['resolveThread'],
	notifications: ['sendNotification'],
	mcp: ['*'], // All MCP tools
} as const;

export type ToolCategory = keyof typeof TOOL_CATEGORIES;

/** Creates core email tools for a given account and Gmail client */
export function createCoreTools(gmail: GmailClient, account: Account): ToolSet {
	return {
		search: createSearchTool(gmail, account),
		get_thread_details: createGetThreadDetailsTool(account),
		createDraft: createDraftTool(account),
		resolveThread: createResolveThreadTool(account),
		sendNotification: createSendNotificationTool(account),
	};
}

/** Loads tools for specified categories */
export async function loadTools(
	categories: ToolCategory[],
	gmail: GmailClient,
	account: Account,
	allowedTools?: string[],
): Promise<ToolSet> {
	const tools: ToolSet = {};

	// Load core tools based on categories
	for (const category of categories) {
		const toolNames = TOOL_CATEGORIES[category];

		if (
			category === 'email' ||
			category === 'drafts' ||
			category === 'thread_management' ||
			category === 'notifications'
		) {
			const coreTools = createCoreTools(gmail, account);

			// Add all tools for this category or filter by allowedTools
			for (const toolName of toolNames) {
				if (!allowedTools || allowedTools.includes(toolName)) {
					if (coreTools[toolName]) {
						tools[toolName] = coreTools[toolName];
					}
				}
			}
		}

		// TODO: Add other categories as we build them
	}

	// Load MCP tools if requested
	if (categories.includes('mcp')) {
		const mcpTools = await createDynamicMCPTools(account);

		// Add all MCP tools or filter by allowedTools
		for (const [toolName, tool] of Object.entries(mcpTools)) {
			if (!allowedTools || allowedTools.includes(toolName)) {
				tools[toolName] = tool;
			}
		}
	}

	return tools;
}
