import { RiCheckLine, RiLoader4Line, RiQuestionLine, RiTimeLine } from '@remixicon/react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate, useParams } from 'react-router';
import { actions } from '../lib/actions.ts';
import { getSpaceDisplayName } from '../lib/util.ts';

export function Component() {
	const { id: spaceId, actionId } = useParams<{ id: string; actionId: string }>();
	const navigate = useNavigate();

	const { data, isLoading, error } = useQuery({
		queryKey: ['actionRuns', actionId],
		queryFn: async () => {
			if (!actionId) throw new Error('Action ID is required');
			const result = await actions.spaces.getActionRuns({ actionId });
			return result;
		},
		enabled: !!actionId,
	});

	const getStatusIcon = (status: string) => {
		switch (status) {
			case 'success':
				return (
					<div className="flex size-4 items-center justify-center rounded-full bg-green-600">
						<RiCheckLine className="size-3 text-white" />
					</div>
				);
			case 'error':
				return (
					<div className="flex size-4 items-center justify-center rounded-full bg-red-600">
						<span className="inline-block rotate-180 text-xs font-bold text-white">!</span>
					</div>
				);
			case 'running':
				return <RiLoader4Line className="size-4 animate-spin text-blue-600" />;
			case 'pending':
				return <RiTimeLine className="size-4 text-yellow-600" />;
			default:
				return <RiTimeLine className="size-4 text-gray-600" />;
		}
	};

	const getStatusColor = (status: string) => {
		switch (status) {
			case 'success':
				return 'text-green-600 bg-green-50';
			case 'error':
				return 'text-red-600 bg-red-50';
			case 'running':
				return 'text-blue-600 bg-blue-50';
			case 'pending':
				return 'text-yellow-600 bg-yellow-50';
			default:
				return 'text-gray-600 bg-gray-50';
		}
	};

	const getDuration = (startedAt: string | Date, completedAt: string | Date | null) => {
		if (!completedAt) return 'Running...';
		const start = new Date(startedAt).getTime();
		const end = new Date(completedAt).getTime();
		const duration = end - start;
		if (duration < 1000) return '<1s';
		if (duration < 60000) return `${Math.round(duration / 1000)}s`;
		return `${Math.round(duration / 60000)}m`;
	};

	return (
		<div className="no-scrollbar h-full w-full overflow-y-auto">
			<div className="flex flex-col">
				{/* Header with breadcrumb */}
				<div className="px-4 py-4 sm:px-8">
					<div className="flex items-center gap-1 text-lg font-medium text-neutral-500">
						<button
							type="button"
							onClick={() => navigate(`/spaces/${spaceId}`)}
							className="hover:text-neutral-700"
						>
							{data && getSpaceDisplayName(data.space.name)}
						</button>
						<span className="mx-1">›</span>
						<span className="text-neutral-900">Action Runs</span>
					</div>
				</div>

				{/* Table */}
				{isLoading ? (
					<div className="flex h-[50vh] items-center justify-center">
						<div className="text-center">
							<RiLoader4Line className="mx-auto size-8 animate-spin text-neutral-400" />
							<div className="mt-2 text-sm text-neutral-500">Loading runs...</div>
						</div>
					</div>
				) : error ? (
					<div className="flex h-[50vh] items-center justify-center">
						<div className="text-center">
							<div className="text-lg font-medium text-red-600">Error loading runs</div>
							<div className="text-sm text-neutral-500">
								{error instanceof Error ? error.message : 'An error occurred'}
							</div>
						</div>
					</div>
				) : !data?.runs || data.runs.length === 0 ? (
					<div className="flex h-[50vh] items-center justify-center">
						<div className="text-center">
							<div className="text-lg font-medium text-neutral-900">No runs yet</div>
							<div className="text-sm text-neutral-500">This action hasn't been executed yet</div>
						</div>
					</div>
				) : (
					<div className="px-4 sm:px-8">
						{/* Table Header */}
						<div className="grid grid-cols-[1fr_80px_120px] items-center gap-4 border-b border-neutral-200 py-3 text-base font-medium text-neutral-500">
							<div className="flex items-center gap-4">
								<RiQuestionLine className="size-4" />
								<span>Action</span>
							</div>
							<span className="text-center">Duration</span>
							<span className="text-right">Date</span>
						</div>

						{/* Table Rows */}
						<div className="space-y-0">
							{data.runs.map((run) => (
								<div
									key={run.id}
									className="grid grid-cols-[1fr_80px_120px] items-start gap-4 py-3 text-base"
								>
									<div className="flex min-w-0 items-start gap-4">
										<div className="flex h-6 w-6 flex-shrink-0 items-center justify-center">
											{getStatusIcon(run.status)}
										</div>
										<div className="min-w-0">
											<div>
												{run.result?.reasoningText ? (
													<span className="text-neutral-900">{run.result.reasoningText}</span>
												) : run.error ? (
													<span className="text-red-700">Error: {run.error}</span>
												) : (
													<span className="text-neutral-500">No details available</span>
												)}
											</div>
											{run.result?.toolCalls && run.result.toolCalls.length > 0 && (
												<div className="mt-2 flex flex-wrap gap-1">
													{run.result.toolCalls.map((toolCall, index) => (
														<span
															key={`${toolCall.toolName}-${index}`}
															className="inline-flex rounded bg-blue-100 px-2 py-1 text-xs text-blue-700"
														>
															{toolCall.toolName}
														</span>
													))}
												</div>
											)}
										</div>
									</div>
									<span className="text-center text-neutral-500">
										{getDuration(run.startedAt, run.completedAt)}
									</span>
									<span className="text-right text-neutral-500">
										{formatDistanceToNow(new Date(run.startedAt), { addSuffix: true }).replace(
											/^about /,
											'',
										)}
									</span>
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
