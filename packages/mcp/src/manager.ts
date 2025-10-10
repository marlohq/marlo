import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { appInstallation, db, eq, mcpServer, skillInstallation } from '@workspace/core/drizzle.js';
import { decrypt, encrypt } from '@workspace/core/oauth/crypto.js';
import { createId } from '@workspace/core/util.js';
import { experimental_createMCPClient as createMCPClient, type ToolSet } from 'ai';

export interface MCPToolExecutionResult {
	content: Array<{ type: 'text'; text: string }>;
}

// Constants
const MCP_CLIENT_CONFIG = {
	name: 'marlo-mcp-client',
	version: '0.0.1',
} as const;

const MCP_CLIENT_OPTIONS = {
	capabilities: {
		roots: { listChanged: true },
		sampling: {},
	},
} as const;

// Utility functions
async function validateAndEncryptUrl(
	url: string,
): Promise<{ encrypted: string; iv: Buffer; tag: Buffer }> {
	// Validate URL
	if (!url.startsWith('https://')) {
		throw new Error('Custom MCP server URLs must use HTTPS');
	}

	try {
		const urlObj = new URL(url);

		// Block private networks for security
		const hostname = urlObj.hostname;
		if (
			hostname === 'localhost' ||
			hostname.startsWith('127.') ||
			hostname.startsWith('192.168.') ||
			hostname.startsWith('10.') ||
			hostname.startsWith('172.')
		) {
			throw new Error('Private network URLs are not allowed');
		}
	} catch (error) {
		throw new Error('Invalid URL format');
	}

	// Encrypt the URL
	return encrypt(url);
}

export async function decryptServerUrl(server: {
	serverUrlEnc: string | null;
	serverUrlIv: Uint8Array | null;
	serverUrlAuthTag: Uint8Array | null;
}): Promise<string> {
	if (!server.serverUrlEnc || !server.serverUrlIv || !server.serverUrlAuthTag) {
		throw new Error('Server missing encryption data');
	}

	return decrypt(
		server.serverUrlEnc,
		Buffer.from(server.serverUrlIv),
		Buffer.from(server.serverUrlAuthTag),
	);
}

async function connectAndListTools(serverUrl: string, transport: 'sse' | 'http'): Promise<ToolSet> {
	const client = await createMCPClient({
		transport:
			transport === 'sse'
				? new SSEClientTransport(new URL(serverUrl))
				: new StreamableHTTPClientTransport(new URL(serverUrl)),
	});
	const tools = await client.tools();
	// TODO(fks): I was seeing issues caused by closing the client too soon, did not realize that the
	// client had to stay open for the tools to be available to use. Need to fix this.
	await client.close();
	return tools;
}

// Detect transport from the live endpoint (fallback to 'sse')
// This follows the official backwards compatibility guide provided by the MCP specification
// see: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#backwards-compatibility
async function detectTransport(serverUrl: string): Promise<'sse' | 'http'> {
	try {
		const initializeRequest = {
			jsonrpc: '2.0',
			id: 'transport-detect',
			method: 'initialize',
			params: {
				clientInfo: MCP_CLIENT_CONFIG,
				capabilities: MCP_CLIENT_OPTIONS.capabilities,
			},
		};

		const resp = await fetch(serverUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json, text/event-stream',
				'MCP-Protocol-Version': '2025-06-18',
			},
			body: JSON.stringify(initializeRequest),
			redirect: 'manual',
		});

		if (resp.ok) {
			const contentType = resp.headers.get('content-type') ?? '';
			if (contentType.includes('application/json') || contentType.includes('text/event-stream')) {
				return 'http';
			}
		}

		// If POST is explicitly not allowed or not found, fall through to SSE detection
		if (resp.status === 405 || resp.status === 404) {
			throw new Error('fallback-to-sse');
		}
	} catch {
		// Ignore and try SSE detection next
	}

	// Try legacy HTTP+SSE by issuing a GET expecting text/event-stream
	try {
		const resp = await fetch(serverUrl, {
			method: 'GET',
			headers: { Accept: 'text/event-stream' },
			redirect: 'manual',
		});
		if (resp.ok) {
			const contentType = resp.headers.get('content-type') ?? '';
			if (contentType.includes('text/event-stream')) {
				return 'sse';
			}
		}
	} catch {
		// ignore
	}

	// Default conservatively to SSE
	return 'sse';
}

// Public API functions
export async function createCustomServer(
	userId: string,
	accountId: string,
	name: string,
	url: string,
): Promise<string> {
	// Validate and encrypt URL
	const { encrypted, iv, tag } = await validateAndEncryptUrl(url);

	// Detect transport from the live endpoint (fallback to 'sse')
	const detectedTransport = (await detectTransport(url).catch(() => 'sse')) as 'sse' | 'http';

	// Create an AppInstallation wrapper for this custom server
	// We use a fixed appId for custom servers; per-install uniqueness is handled by id
	const appInstallationId = createId();
	await db.insert(appInstallation).values({
		id: appInstallationId,
		appId: 'custom-mcp-server',
		userId,
		accountId,
		state: {},
	});

	// Create server record linked to the AppInstallation
	const [server] = await db
		.insert(mcpServer)
		.values({
			userId,
			name,
			serverUrlEnc: encrypted,
			serverUrlIv: iv,
			serverUrlAuthTag: tag,
			status: 'INACTIVE',
			transport: detectedTransport,
			appInstallationId,
		})
		.returning();

	if (!server) {
		throw new Error('Failed to create MCP server record');
	}

	// If GitHub or Stripe, update appInstallation.appId and seed/link skill
	const lowerName = name.toLowerCase();
	if (lowerName === 'github' || lowerName === 'stripe') {
		await db.insert(skillInstallation).values({
			accountId,
			skillId: lowerName,
			appInstallationId: appInstallationId,
		});
	}

	// Test connection
	try {
		await connectAndListTools(url, server.transport);
		await db
			.update(mcpServer)
			.set({ status: 'ACTIVE', lastError: null })
			.where(eq(mcpServer.id, server.id));
	} catch (error) {
		await db
			.update(mcpServer)
			.set({
				status: 'ERROR',
				lastError: error instanceof Error ? error.message : 'Connection failed',
			})
			.where(eq(mcpServer.id, server.id));
	}

	return server.id;
}

export async function getUserServers(userId: string) {
	return db.query.mcpServer.findMany({
		where: (mcpServer, { eq }) => eq(mcpServer.userId, userId),
		orderBy: (mcpServer, { desc }) => [desc(mcpServer.createdAt)],
	});
}

export async function deleteServer(userId: string, serverId: string): Promise<void> {
	const server = await db.query.mcpServer.findFirst({
		where: (s, { eq, and }) => and(eq(s.id, serverId), eq(s.userId, userId)),
	});
	if (!server) return;

	// Deleting the AppInstallation will cascade delete the MCPServer
	await db.delete(appInstallation).where(eq(appInstallation.id, server.appInstallationId));
}

export async function getServerTools(serverId: string): Promise<ToolSet> {
	const server = await db.query.mcpServer.findFirst({
		where: (mcpServer, { eq }) => eq(mcpServer.id, serverId),
	});

	if (!server) {
		throw new Error('Server not found');
	}

	// Decrypt URL
	const url = await decryptServerUrl(server);

	return connectAndListTools(url, server.transport);
}
