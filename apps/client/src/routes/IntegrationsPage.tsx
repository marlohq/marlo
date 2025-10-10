import { safe } from '@orpc/client';
import { RiAddLine, RiServerLine, RiSettings3Line } from '@remixicon/react';
import type { MCPServer as DBMCPServer } from '@workspace/core/drizzle.js';
import { Badge, Button } from '@workspace/ui';
import { useCallback, useEffect, useState } from 'react';
import { actions } from '../lib/actions.ts';

type MCPServer = Pick<DBMCPServer, 'id' | 'name' | 'status' | 'createdAt'>;

function MCPServerCard({
	server,
	onDelete,
}: {
	server: MCPServer;
	onDelete: (id: string) => void;
}) {
	const getStatusColor = (status: string) => {
		switch (status) {
			case 'ACTIVE':
				return 'bg-green-100 text-green-800';
			case 'ERROR':
				return 'bg-red-100 text-red-800';
			case 'CONNECTING':
				return 'bg-yellow-100 text-yellow-800';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	};
	const createdDate = new Date(server.createdAt).toLocaleDateString();
	return (
		<div className="flex items-center justify-between rounded-md border border-neutral-200 bg-white px-4 py-3">
			<div className="flex items-center gap-3">
				<RiServerLine className="size-5 text-neutral-600" />
				<div>
					<div className="flex items-center gap-2">
						<span className="font-medium text-neutral-900">{server.name}</span>
						<Badge className={getStatusColor(server.status)}>
							{server.status.charAt(0) + server.status.slice(1).toLowerCase()}
						</Badge>
					</div>
					<div className="text-sm text-neutral-600">Custom MCP Server</div>
					<div className="mt-1 text-xs text-neutral-400">Created {createdDate}</div>
				</div>
			</div>
			<Button
				variant="outline"
				size="sm"
				onClick={() => onDelete(server.id)}
				className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-800"
			>
				Remove
			</Button>
		</div>
	);
}

function AddCustomServerForm({ onAdd, onCancel }: { onAdd: () => void; onCancel: () => void }) {
	const [name, setName] = useState('');
	const [url, setUrl] = useState('');
	const [isLoading, setIsLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!name.trim() || !url.trim()) return;
		setIsLoading(true);
		const result = await safe(
			actions.mcp.createCustomServer({
				name: name.trim(),
				url: url.trim(),
			}),
		);
		if (!result.error) {
			setName('');
			setUrl('');
			onAdd();
		} else {
			console.error('Failed to create server:', result.error);
		}
		setIsLoading(false);
	};

	return (
		<div className="mx-auto mb-4 max-w-lg rounded-lg border border-neutral-200 bg-white p-4">
			<h3 className="mb-4 font-medium text-neutral-900">Add Custom MCP Server</h3>
			<form onSubmit={handleSubmit} className="space-y-4">
				<div>
					<label htmlFor="serverName" className="mb-1 block text-sm font-medium text-neutral-700">
						Server Name
					</label>
					<input
						id="serverName"
						type="text"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="My Custom Server"
						className="w-full rounded-md border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
						required
					/>
				</div>
				<div>
					<label htmlFor="serverUrl" className="mb-1 block text-sm font-medium text-neutral-700">
						Server URL
					</label>
					<input
						id="serverUrl"
						type="url"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						placeholder="https://my-mcp-server.com"
						className="w-full rounded-md border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
						required
					/>
				</div>
				<div className="flex gap-2">
					<Button type="submit" disabled={isLoading}>
						{isLoading ? 'Adding...' : 'Add Server'}
					</Button>
					<Button type="button" variant="ghost" onClick={onCancel}>
						Cancel
					</Button>
				</div>
			</form>
		</div>
	);
}

function IntegrationsPage() {
	const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [showAddForm, setShowAddForm] = useState(false);

	const loadData = useCallback(async () => {
		setIsLoading(true);
		const serversResult = await safe(actions.mcp.getServers({}));
		if (serversResult.error) {
			console.error('Error loading data:', serversResult.error);
		}
		setMcpServers(serversResult.data?.servers || []);
		setIsLoading(false);
	}, []);

	useEffect(() => {
		loadData();
	}, [loadData]);

	const handleDeleteServer = async (serverId: string) => {
		const result = await safe(actions.mcp.deleteServer({ id: serverId }));
		if (!result.error) {
			await loadData();
		} else {
			console.error('Error deleting server:', result.error);
		}
	};

	return (
		<div className="mx-auto w-[60rem] space-y-10 px-4 py-10">
			{/* Header */}
			<div className="mb-2 flex items-center gap-3">
				<RiSettings3Line className="size-6 text-neutral-500" />
				<h1 className="text-2xl font-bold text-neutral-900">Integrations</h1>
			</div>

			{/* Connect Your Accounts Section */}
			<section className="mb-8 p-0">
				<h2 className="mb-1 text-lg font-semibold text-neutral-900">Connect Your Accounts</h2>
				<p className="text-sm text-neutral-600">
					Connect external services to enhance your email workflow with automated actions and
					integrations.
				</p>
			</section>

			{/* Custom MCP Servers Section */}
			<section className="p-0">
				<div className="mb-4 flex items-center justify-between">
					<div>
						<h2 className="text-lg font-semibold text-neutral-900">Custom MCP Servers</h2>
						<p className="text-sm text-neutral-600">
							Add your own MCP servers from services like Smithery or custom implementations.
						</p>
					</div>
					<Button onClick={() => setShowAddForm((v) => !v)} className="flex items-center gap-2">
						<RiAddLine className="size-4" />
						Add Server
					</Button>
				</div>
				{showAddForm && (
					<AddCustomServerForm
						onAdd={() => {
							setShowAddForm(false);
							loadData();
						}}
						onCancel={() => setShowAddForm(false)}
					/>
				)}
				{isLoading ? (
					<div className="py-8 text-center text-neutral-600">Loading integrations...</div>
				) : mcpServers.length > 0 ? (
					<div className="space-y-3">
						{mcpServers.map((server) => (
							<MCPServerCard key={server.id} server={server} onDelete={handleDeleteServer} />
						))}
					</div>
				) : (
					<div className="py-8 text-center text-neutral-600">
						<RiServerLine className="mx-auto mb-2 size-8 text-neutral-400" />
						<p>No custom MCP servers configured.</p>
						<p className="text-sm">Add a custom server to get started.</p>
					</div>
				)}
			</section>
		</div>
	);
}

export default IntegrationsPage;
export { IntegrationsPage as Component };
