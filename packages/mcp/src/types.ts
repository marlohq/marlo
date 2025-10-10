// Simplified types for custom MCP servers only
export type MCPServerStatus = 'INACTIVE' | 'ACTIVE' | 'ERROR' | 'CONNECTING';

export interface MCPToolExecutionResult {
	content: Array<{ type: 'text'; text: string }>;
}
