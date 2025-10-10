import { zodResolver } from '@hookform/resolvers/zod';
import {
	RiAddLine,
	RiCloseLine,
	RiDeleteBinLine,
	RiEqualizer2Line,
	RiFilter3Line,
	RiFlashlightLine,
	RiMoreFill,
	RiShapesLine,
	RiSubtractLine,
	RiTextBlock,
	RiTriangleFill,
} from '@remixicon/react';
import type { PropertyType, SpaceFilter } from '@workspace/core/space.js';
import { createId } from '@workspace/core/util.js';
import type { Database } from '@workspace/local/database.js';
import { mutate } from '@workspace/local/mutate.js';
import { useQuery } from '@workspace/local/query.js';
import type { SpaceData } from '@workspace/sync-data/data.js';
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@workspace/ui';
import { subDays } from 'date-fns';
import { invariant } from 'es-toolkit';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate, useParams } from 'react-router';
import type { VirtuosoHandle } from 'react-virtuoso';
import { toast } from 'sonner';
import { z } from 'zod';
import {
	useCommandPalette,
	useCommandPaletteActions,
} from '../components/CommandPalette/context.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { ThreadTableList } from '../components/ThreadTableList.tsx';
import { getSpaceDisplayName } from '../lib/util.ts';
import { ClientThread } from '../threads/model.ts';

function useSpaceIdParam(): string {
	const { pathname } = useLocation();
	const { id } = useParams();
	invariant(id, `Invalid route, expected "/spaces/:id" but got "${pathname}".`);
	return id;
}

function EditableSpaceName({ space }: { space: SpaceData }) {
	const [value, setValue] = useState(space.name);

	const handleNameUpdate = useCallback(
		async (newName: string) => {
			const trimmedName = newName.trim();
			if (trimmedName !== space.name) {
				try {
					await mutate.spaces.update(space.id, { name: trimmedName });
				} catch (error) {
					console.error('Failed to update view name:', error);
					// Reset to original name on error
					setValue(space.name);
				}
			}
		},
		[space.id, space.name],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				e.currentTarget.blur();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				setValue(space.name);
				e.currentTarget.blur();
			}
		},
		[space.name],
	);

	const handleBlur = useCallback(
		(e: React.FocusEvent<HTMLInputElement>) => {
			handleNameUpdate(e.currentTarget.value);
		},
		[handleNameUpdate],
	);

	const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		setValue(e.currentTarget.value);
	}, []);

	return (
		<input
			className="h-8 border-none bg-transparent px-2 text-[28px] font-semibold leading-8 outline-none placeholder:text-neutral-400 focus:rounded focus:bg-neutral-50"
			placeholder="Untitled Space"
			value={value}
			onChange={handleChange}
			onBlur={handleBlur}
			onKeyDown={handleKeyDown}
		/>
	);
}

function getDBQuery(db: Database, spaceId: string) {
	return db.threads.where('view').equals(`space:${spaceId}`);
}

export function Component() {
	const spaceId = useSpaceIdParam();
	const resolvedAtWindow = subDays(new Date(), 1);
	resolvedAtWindow.setHours(0, 0, 0, 0);
	const [space, spaceInfo] = useQuery(
		(db) => db.spaces.where('data.id').equals(spaceId).first(),
		[spaceId],
	);
	const [rows, threadsInfo] = useQuery((db) => getDBQuery(db, spaceId).toArray(), [spaceId]);
	const [resolvedRows, resolvedThreadsInfo] = useQuery(
		(db) =>
			db.threads
				.where('view')
				.equals(`space:${spaceId}`)
				.and((t) => !!t.data.resolvedAt && new Date(t.data.resolvedAt) > resolvedAtWindow)
				.reverse()
				.toArray(),
		[spaceId],
	);

	const allThreads = useMemo(() => {
		if (!rows || !resolvedRows) {
			return null;
		}
		const threads = rows.map((r) => new ClientThread(r.data));
		const resolvedThreads = resolvedRows.map((r) => new ClientThread(r.data));

		// Deduplicate threads by ID using a Map
		const threadMap = new Map<string, ClientThread>();

		// Add all threads to the map (resolved threads will overwrite inbox threads with same ID)
		for (const thread of threads) {
			threadMap.set(thread.id, thread);
		}
		for (const thread of resolvedThreads) {
			threadMap.set(thread.id, thread);
		}

		// Convert back to array and sort
		return Array.from(threadMap.values()).sort(
			(a, b) => b.lastSentAt.getTime() - a.lastSentAt.getTime(),
		);
	}, [rows, resolvedRows]);

	if (
		spaceInfo.status === 'loading' ||
		threadsInfo.status === 'loading' ||
		resolvedThreadsInfo.status === 'loading' ||
		space?.data?.id !== spaceId
	) {
		return null;
	}
	if (!space?.data || !allThreads) {
		return <EmptyState message={`No space ${spaceId}`} />;
	}

	return <SpaceDetailsView key={spaceId} space={space.data} threads={allThreads} />;
}

type SidebarState =
	| { view: 'filters' }
	| { view: 'properties' }
	| { view: 'properties.detail'; id: string }
	| { view: 'actions' }
	| { view: 'actions.detail'; id: string }
	| { view: 'display' }
	| null;

function SpaceDetailsView({ space, threads }: { space: SpaceData; threads: ClientThread[] }) {
	const ref = useRef<VirtuosoHandle | null>(null);
	const navigate = useNavigate();
	const { isOpen: isCommandPaletteOpen } = useCommandPalette();
	const { setPageContext, setNavigationHistory } = useCommandPaletteActions();
	const [sidebarState, setSidebarState] = useState<SidebarState>(null);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const isSidebarOpen = sidebarState !== null;

	// Set command palette context for this space
	useEffect(() => {
		setPageContext({
			title: { text: getSpaceDisplayName(space.name) },
			view: { type: 'root' },
		});
	}, [space.name, setPageContext]);

	// Track navigation history so ThreadDetails Escape navigates back to this space
	useEffect(() => {
		setNavigationHistory({
			to: `/spaces/${space.id}`,
			ids: threads.map((t) => t.id),
		});
	}, [space.id, threads, setNavigationHistory]);

	const handlePropertySelect = (propertyId: string) => {
		setSidebarState({ view: 'properties.detail', id: propertyId });
	};

	const handlePropertyDetailsClose = () => {
		setSidebarState({ view: 'properties' });
	};

	const handleActionSelect = (actionId: string) => {
		setSidebarState({ view: 'actions.detail', id: actionId });
	};

	const handleActionDetailsClose = () => {
		setSidebarState({ view: 'actions' });
	};

	// Process threads with sorting and grouping (memoized for performance)
	const processedThreads = useMemo(() => {
		// Pre-compute property values to avoid repeated getViewTag calls
		const threadsWithProperties = threads.map((thread) => {
			const properties = thread.spaceProperties;
			return { thread, properties };
		});

		// Create a more efficient collator for string comparison
		const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

		// Apply sorting if specified
		if (space.sortBy) {
			const sortByProperty = space.sortBy;
			threadsWithProperties.sort((a, b) => {
				const aValue = a.properties[sortByProperty] || '';
				const bValue = b.properties[sortByProperty] || '';
				return collator.compare(String(aValue), String(bValue));
			});
		}

		// Apply grouping - either by property or default by resolvedAt
		if (space.groupBy) {
			// Group by specified property
			const groupByProperty = space.groupBy;
			const groups = new Map<string, typeof threadsWithProperties>();

			for (const threadWithProps of threadsWithProperties) {
				const propertyValue = threadWithProps.properties[groupByProperty];
				const groupKey = propertyValue ? String(propertyValue) : 'No value';
				const groupThreads = groups.get(groupKey) || [];
				groupThreads.push(threadWithProps);
				if (!groups.has(groupKey)) {
					groups.set(groupKey, groupThreads);
				}
			}

			// Sort groups by key and flatten
			const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => {
				// "No value" should come last
				if (a === 'No value' && b !== 'No value') return 1;
				if (b === 'No value' && a !== 'No value') return -1;
				return collator.compare(a, b);
			});

			return sortedGroups.flatMap(([groupKey, groupThreads]) => [
				{
					id: `HEADER:GROUP:${groupKey}`,
					type: 'header' as const,
					title: groupKey,
				},
				...groupThreads.map(({ thread }) => ({
					id: thread.id,
					type: 'thread' as const,
					thread: thread,
				})),
			]);
		} else {
			// Default grouping by resolvedAt

			const result = [];

			if (threadsWithProperties.length > 0) {
				result.push(
					...threadsWithProperties.map(({ thread }) => ({
						id: thread.id,
						type: 'thread' as const,
						thread: thread,
					})),
				);
			}

			return result;
		}
	}, [threads, space.groupBy, space.sortBy]);

	return (
		<>
			<div className="relative flex h-24 shrink-0 items-center px-2 pb-2 sm:px-8">
				<div className="flex flex-col gap-1.5 pt-2">
					<div className="flex items-center gap-px">
						<Button
							size="icon"
							variant="secondary"
							className="ml-2 flex size-8 items-center justify-center"
						>
							<RiTriangleFill className="size-5" />
						</Button>
						<EditableSpaceName space={space} />
					</div>
					<div className="px-2 text-lg text-neutral-500">Add description...</div>
				</div>
				<div className="flex-1" />
				{!isSidebarOpen && (
					<div className="flex h-9 items-center overflow-hidden rounded-md bg-white px-2 shadow-md outline outline-1 outline-neutral-900/15">
						<Button
							size="icon"
							variant="ghost"
							className="size-8 rounded-none"
							onClick={() => setSidebarState({ view: 'filters' })}
						>
							<RiFilter3Line className="size-5" />
						</Button>
						<Button
							size="icon"
							variant="ghost"
							className="size-8 rounded-none"
							onClick={() => setSidebarState({ view: 'display' })}
						>
							<RiEqualizer2Line className="size-5" />
						</Button>
						<Button
							size="icon"
							variant="ghost"
							className="size-8 rounded-none"
							onClick={() => setSidebarState({ view: 'properties' })}
						>
							<RiShapesLine className="size-5" />
						</Button>
						<Button
							size="icon"
							variant="ghost"
							className="size-8 rounded-none"
							onClick={() => setSidebarState({ view: 'actions' })}
						>
							<RiFlashlightLine className="size-5" />
						</Button>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button size="icon" variant="ghost" className="size-8 rounded-none">
									<RiMoreFill className="size-5" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-48">
								<DropdownMenuItem
									onClick={() => setIsDeleteDialogOpen(true)}
									className="text-red-600 focus:text-red-600"
								>
									<RiDeleteBinLine className="mr-2 size-4" />
									Delete space
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				)}
				{sidebarState?.view === 'filters' && (
					<FiltersForm space={space} onClose={() => setSidebarState(null)} />
				)}
				{sidebarState?.view === 'display' && (
					<DisplayForm space={space} onClose={() => setSidebarState(null)} />
				)}
				{sidebarState?.view === 'properties' && (
					<PropertiesList
						space={space}
						onClose={() => setSidebarState(null)}
						onPropertySelect={handlePropertySelect}
					/>
				)}
				{sidebarState?.view === 'properties.detail' && (
					<PropertyDetailsForm
						space={space}
						propertyId={sidebarState.id}
						onClose={handlePropertyDetailsClose}
					/>
				)}
				{sidebarState?.view === 'actions' && (
					<ActionsList
						space={space}
						onClose={() => setSidebarState(null)}
						onActionSelect={handleActionSelect}
					/>
				)}
				{sidebarState?.view === 'actions.detail' && (
					<ActionDetailsForm
						space={space}
						actionId={sidebarState.id}
						onClose={handleActionDetailsClose}
					/>
				)}
			</div>

			{threads.length === 0 ? (
				<div className="flex h-full w-full items-center justify-center pb-24 text-neutral-500">
					<div className="flex items-center gap-1">
						<RiTriangleFill className="size-4 text-neutral-900" />
						<span className="font-medium text-neutral-900">{getSpaceDisplayName(space.name)}</span>
						<span>is empty.</span>
					</div>
				</div>
			) : (
				<ThreadTableList
					id={`view:${space.id}`}
					ref={ref}
					island={true}
					autoFocus={true}
					isActive={() => !isCommandPaletteOpen}
					data={processedThreads}
				/>
			)}

			<Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete space</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete "{getSpaceDisplayName(space.name)}"? This action
							cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={async () => {
								try {
									await mutate.spaces.delete(space.id);
									toast.success('Space deleted successfully');
									setIsDeleteDialogOpen(false);
									navigate('/');
								} catch (error) {
									console.error('Failed to delete space:', error);
									toast.error('Failed to delete space');
								}
							}}
						>
							Delete
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

const filtersFormSchema = z.object({
	category: z.string().optional(),
	from: z.string().optional(),
	to: z.string().optional(),
	subject: z.string().optional(),
	body: z.string().optional(),
	aiFilter: z.string().optional(),
});

const propertiesFormSchema = z.object({
	properties: z
		.array(
			z.object({
				id: z.string().min(1, 'Property ID is required'),
				name: z.string().min(1, 'Property name is required'),
				type: z.enum(['string']),
			}),
		)
		.default([]),
});

type FiltersFormData = z.infer<typeof filtersFormSchema>;
type PropertiesFormData = z.infer<typeof propertiesFormSchema>;

function FiltersForm({ space, onClose }: { space: SpaceData; onClose: () => void }) {
	// Convert existing space filters back to form data
	const convertFiltersToFormData = (filters: SpaceFilter): FiltersFormData => {
		const formData: FiltersFormData = {
			category: '',
			from: '',
			to: '',
			subject: '',
			body: '',
			aiFilter: '',
		};

		// Flatten all filter groups and extract values
		for (const filterGroup of filters) {
			for (const filter of filterGroup) {
				if ('query' in filter) {
					// Natural language filter - add to aiFilter
					if (formData.aiFilter) {
						formData.aiFilter += `, ${filter.query}`;
					} else {
						formData.aiFilter = filter.query;
					}
				} else {
					// Structured filter
					const values = Array.isArray(filter.value) ? filter.value : [filter.value];
					const valueString = values.join(', ');

					switch (filter.field) {
						case 'from':
							formData.from = formData.from ? `${formData.from}, ${valueString}` : valueString;
							break;
						case 'to':
							formData.to = formData.to ? `${formData.to}, ${valueString}` : valueString;
							break;
						case 'subject':
							formData.subject = formData.subject
								? `${formData.subject}, ${valueString}`
								: valueString;
							break;
						case 'body':
							formData.body = formData.body ? `${formData.body}, ${valueString}` : valueString;
							break;
						case 'labels':
							formData.category = formData.category
								? `${formData.category}, ${valueString}`
								: valueString;
							break;
					}
				}
			}
		}

		return formData;
	};

	const defaultValues = convertFiltersToFormData(space.filters || []);

	const filtersForm = useForm<FiltersFormData>({
		resolver: zodResolver(filtersFormSchema),
		defaultValues,
	});

	const onSubmit = async (data: FiltersFormData) => {
		try {
			// Transform form data into SpaceFilter format
			const filters: SpaceFilter = [];

			if (data.from) {
				filters.push([{ field: 'from', operator: 'contains', value: data.from }]);
			}
			if (data.to) {
				filters.push([{ field: 'to', operator: 'contains', value: data.to }]);
			}
			if (data.subject) {
				filters.push([{ field: 'subject', operator: 'contains', value: data.subject }]);
			}
			if (data.body) {
				filters.push([{ field: 'body', operator: 'contains', value: data.body }]);
			}
			if (data.aiFilter) {
				filters.push([{ query: data.aiFilter }]);
			}
			if (data.category) {
				filters.push([{ field: 'labels', operator: 'contains', value: [data.category] }]);
			}

			// If no filters were added, add a default empty filter group
			if (filters.length === 0) {
				filters.push([{ query: '' }]);
			}

			await mutate.spaces.update(space.id, { filters });
			toast.success('Filters updated successfully');
			onClose();
		} catch (error) {
			console.error('Failed to update filters:', error);
			toast.error('Failed to update filters');
		}
	};

	return (
		<div className="absolute right-0 top-0 z-20 w-[420px] pb-4 pl-4 pr-8">
			<div className="flex w-full flex-col gap-2 rounded-md bg-white p-4 shadow-3xl outline outline-1 outline-neutral-900/15">
				<div className="flex items-center gap-1">
					<div className="flex-1 font-medium leading-6">Filters</div>
					<Button size="icon" variant="ghost" className="size-6" onClick={onClose}>
						<RiCloseLine className="size-5" />
					</Button>
				</div>

				<Form {...filtersForm}>
					<form onSubmit={filtersForm.handleSubmit(onSubmit)} className="space-y-1">
						<FormField
							control={filtersForm.control}
							name="category"
							render={({ field }) => (
								<FormItem>
									<div className="flex h-8 items-center justify-start gap-1.5 rounded-lg">
										<FormLabel className="w-[108px] justify-start text-sm font-normal leading-snug text-neutral-500">
											Category
										</FormLabel>
										<FormControl>
											<Input className="h-8 flex-1 px-2" {...field} />
										</FormControl>
										<Button size="icon" variant="ghost" className="size-6" type="button">
											<RiSubtractLine className="size-5" />
										</Button>
									</div>
								</FormItem>
							)}
						/>
						<FormField
							control={filtersForm.control}
							name="from"
							render={({ field }) => (
								<FormItem>
									<div className="flex h-8 items-center justify-start gap-1.5 rounded-lg">
										<FormLabel className="w-[108px] justify-start text-sm font-normal leading-snug text-neutral-500">
											From
										</FormLabel>
										<FormControl>
											<Input className="h-8 flex-1 px-2" {...field} />
										</FormControl>
										<Button size="icon" variant="ghost" className="size-6" type="button">
											<RiSubtractLine className="size-5" />
										</Button>
									</div>
								</FormItem>
							)}
						/>
						<FormField
							control={filtersForm.control}
							name="to"
							render={({ field }) => (
								<FormItem>
									<div className="flex h-8 items-center justify-start gap-1.5 rounded-lg">
										<FormLabel className="w-[108px] justify-start text-sm font-normal leading-snug text-neutral-500">
											To
										</FormLabel>
										<FormControl>
											<Input className="h-8 flex-1 px-2" {...field} />
										</FormControl>
										<Button size="icon" variant="ghost" className="size-6" type="button">
											<RiSubtractLine className="size-5" />
										</Button>
									</div>
								</FormItem>
							)}
						/>
						<FormField
							control={filtersForm.control}
							name="subject"
							render={({ field }) => (
								<FormItem>
									<div className="flex h-8 items-center justify-start gap-1.5 rounded-lg">
										<FormLabel className="w-[108px] justify-start text-sm font-normal leading-snug text-neutral-500">
											Subject
										</FormLabel>
										<FormControl>
											<Input className="h-8 flex-1 px-2" {...field} />
										</FormControl>
										<Button size="icon" variant="ghost" className="size-6" type="button">
											<RiSubtractLine className="size-5" />
										</Button>
									</div>
								</FormItem>
							)}
						/>
						<FormField
							control={filtersForm.control}
							name="body"
							render={({ field }) => (
								<FormItem>
									<div className="flex h-8 items-center justify-start gap-1.5 rounded-lg">
										<FormLabel className="w-[108px] justify-start text-sm font-normal leading-snug text-neutral-500">
											Body
										</FormLabel>
										<FormControl>
											<Input className="h-8 flex-1 px-2" {...field} />
										</FormControl>
										<Button size="icon" variant="ghost" className="size-6" type="button">
											<RiSubtractLine className="size-5" />
										</Button>
									</div>
								</FormItem>
							)}
						/>
						<FormField
							control={filtersForm.control}
							name="aiFilter"
							render={({ field }) => (
								<FormItem>
									<div className="flex h-8 items-center justify-start gap-1.5 rounded-lg">
										<FormLabel className="w-[108px] justify-start text-sm font-normal leading-snug text-neutral-500">
											AI Filter
										</FormLabel>
										<FormControl>
											<Input className="h-8 flex-1 px-2" {...field} />
										</FormControl>
										<Button size="icon" variant="ghost" className="size-6" type="button">
											<RiSubtractLine className="size-5" />
										</Button>
									</div>
								</FormItem>
							)}
						/>
						<div className="pt-2">
							<Button type="submit" className="w-full">
								Save
							</Button>
						</div>
					</form>
				</Form>
			</div>
		</div>
	);
}

function PropertiesList({
	space,
	onClose,
	onPropertySelect,
}: {
	space: SpaceData;
	onClose: () => void;
	onPropertySelect: (propertyId: string) => void;
}) {
	const properties = space.properties || [];

	const handleAddProperty = async () => {
		const newPropertyId = createId();
		const newProperty = {
			id: newPropertyId,
			name: '',
			type: 'string' as PropertyType,
			prompt: '',
		};

		try {
			const updatedProperties = [...properties, newProperty];
			await mutate.spaces.update(space.id, { properties: updatedProperties });
			onPropertySelect(newPropertyId);
		} catch (error) {
			console.error('Failed to add property:', error);
			toast.error('Failed to add property');
		}
	};

	const handleRemoveProperty = async (propertyId: string) => {
		try {
			const updatedProperties = properties.filter((p) => p.id !== propertyId);
			await mutate.spaces.update(space.id, { properties: updatedProperties });
			toast.success('Property removed successfully');
		} catch (error) {
			console.error('Failed to remove property:', error);
			toast.error('Failed to remove property');
		}
	};

	return (
		<div className="absolute right-0 top-0 z-20 w-[420px] pb-4 pl-4 pr-8">
			<div className="flex w-full flex-col gap-2 rounded-md bg-white p-4 shadow-3xl outline outline-1 outline-neutral-900/15">
				<div className="flex items-center gap-1">
					<div className="flex-1 font-medium leading-6">Properties</div>
					<Button size="icon" variant="ghost" className="size-6" onClick={onClose}>
						<RiCloseLine className="size-5" />
					</Button>
				</div>

				<div className="flex flex-col gap-1">
					{properties.length > 0 && (
						<div className="space-y-1">
							{properties.map((property) => (
								<div key={property.id} className="flex items-center gap-0.5">
									<button
										type="button"
										className="flex h-7 flex-1 cursor-pointer items-center gap-1.5 rounded-lg hover:bg-neutral-50"
										onClick={() => onPropertySelect(property.id)}
									>
										<RiTextBlock className="size-4 text-neutral-500" />
										<div className="font-medium">{property.name || 'Untitled Property'}</div>
										<div className="capitalize text-neutral-500">{property.type}</div>
									</button>
									<Button
										size="icon"
										variant="ghost"
										className="size-6"
										onClick={(e) => {
											e.stopPropagation();
											handleRemoveProperty(property.id);
										}}
									>
										<RiSubtractLine className="size-5" />
									</Button>
								</div>
							))}
						</div>
					)}
					<Button
						variant="ghost"
						className="flex h-8 items-center justify-start gap-2 rounded-lg"
						onClick={handleAddProperty}
					>
						<RiAddLine className="size-5 text-neutral-500" />
						<div className="">Add property</div>
						<div className="flex-1"></div>
					</Button>
				</div>
			</div>
		</div>
	);
}

const propertyDetailsFormSchema = z.object({
	name: z.string().min(1, 'Property name is required'),
	prompt: z.string(),
});

type PropertyDetailsFormData = z.infer<typeof propertyDetailsFormSchema>;

function PropertyDetailsForm({
	space,
	propertyId,
	onClose,
}: {
	space: SpaceData;
	propertyId: string;
	onClose: () => void;
}) {
	const properties = space.properties || [];
	const property = properties.find((p) => p.id === propertyId);

	const propertyDetailsForm = useForm<PropertyDetailsFormData>({
		resolver: zodResolver(propertyDetailsFormSchema),
		defaultValues: {
			name: property?.name || '',
			prompt: property?.prompt || '',
		},
	});

	if (!property) {
		return (
			<div className="absolute right-0 top-0 z-20 w-[420px] pb-4 pl-4 pr-8">
				<div className="flex w-full flex-col gap-2 rounded-md bg-white p-4 shadow-3xl outline outline-1 outline-neutral-900/15">
					<div className="flex items-center gap-1">
						<div className="flex-1 font-medium leading-6">Property Not Found</div>
						<Button size="icon" variant="ghost" className="size-6" onClick={onClose}>
							<RiCloseLine className="size-5" />
						</Button>
					</div>
				</div>
			</div>
		);
	}
	const onSubmit = async (data: PropertyDetailsFormData) => {
		try {
			const updatedProperties = properties.map((p) =>
				p.id === propertyId ? { ...p, name: data.name, prompt: data.prompt } : p,
			);
			await mutate.spaces.update(space.id, { properties: updatedProperties });
			toast.success('Property updated successfully');
			onClose();
		} catch (error) {
			console.error('Failed to update property:', error);
			toast.error('Failed to update property');
		}
	};

	return (
		<div className="absolute right-0 top-0 z-20 w-[420px] pb-4 pl-4 pr-8">
			<div className="flex w-full flex-col gap-2 rounded-md bg-white p-4 shadow-3xl outline outline-1 outline-neutral-900/15">
				<div className="flex items-center gap-1">
					<div className="flex-1 font-medium leading-6">Property</div>
					<Button size="icon" variant="ghost" className="size-6" onClick={onClose}>
						<RiCloseLine className="size-5" />
					</Button>
				</div>

				<Form {...propertyDetailsForm}>
					<form onSubmit={propertyDetailsForm.handleSubmit(onSubmit)} className="space-y-4">
						<FormField
							control={propertyDetailsForm.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="sr-only">Property Name</FormLabel>
									<FormControl>
										<Input className="h-8 px-2" placeholder="Name" {...field} />
									</FormControl>
								</FormItem>
							)}
						/>
						<FormField
							control={propertyDetailsForm.control}
							name="prompt"
							render={({ field }) => (
								<FormItem className="flex flex-col">
									<FormLabel className="text-sm font-normal leading-snug text-neutral-500">
										AI Prompt
									</FormLabel>
									<FormControl>
										<textarea
											className="flex w-full rounded-lg border border-neutral-300 bg-transparent px-2 py-1 transition-colors placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950"
											placeholder="Prompt"
											rows={4}
											{...field}
										/>
									</FormControl>
								</FormItem>
							)}
						/>
						<div className="pt-2">
							<Button type="submit" className="w-full">
								Save
							</Button>
						</div>
					</form>
				</Form>
			</div>
		</div>
	);
}

function DisplayForm({ space, onClose }: { space: SpaceData; onClose: () => void }) {
	const properties = space.properties || [];

	const handleGroupByChange = async (value: string) => {
		try {
			const groupBy = value === 'none' ? null : value;
			await mutate.spaces.update(space.id, { groupBy });
		} catch (error) {
			console.error('Failed to update group by:', error);
			toast.error('Failed to update group by');
		}
	};

	const handleSortByChange = async (value: string) => {
		try {
			const sortBy = value === 'none' ? null : value;
			await mutate.spaces.update(space.id, { sortBy });
		} catch (error) {
			console.error('Failed to update sort by:', error);
			toast.error('Failed to update sort by');
		}
	};

	return (
		<div className="absolute right-0 top-0 z-20 w-[420px] pb-4 pl-4 pr-8">
			<div className="flex w-full flex-col gap-2 rounded-md bg-white p-4 shadow-3xl outline outline-1 outline-neutral-900/15">
				<div className="flex items-center gap-1">
					<div className="flex-1 font-medium leading-6">Display</div>
					<Button size="icon" variant="ghost" className="size-6" onClick={onClose}>
						<RiCloseLine className="size-5" />
					</Button>
				</div>

				<div className="space-y-4">
					<div className="space-y-2">
						<label htmlFor="group-by-select" className="text-sm font-medium">
							Group By
						</label>
						<Select value={space.groupBy || 'none'} onValueChange={handleGroupByChange}>
							<SelectTrigger id="group-by-select" className="h-8">
								<SelectValue placeholder="Select grouping" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">None</SelectItem>
								{properties.map((property) => (
									<SelectItem key={property.id} value={property.id}>
										{property.name || 'Untitled Property'}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-2">
						<label htmlFor="sort-by-select" className="text-sm font-medium">
							Sort By
						</label>
						<Select value={space.sortBy || 'none'} onValueChange={handleSortByChange}>
							<SelectTrigger id="sort-by-select" className="h-8">
								<SelectValue placeholder="Select sorting" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">None</SelectItem>
								{properties.map((property) => (
									<SelectItem key={property.id} value={property.id}>
										{property.name || 'Untitled Property'}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* TODO: Hook this up into the DB -- currently hardcoded at last-1 in the component logic */}
					<div className="space-y-2">
						<label htmlFor="sort-by-select" className="text-sm font-medium">
							Resolved Threads
						</label>
						<Select defaultValue="none">
							<SelectTrigger id="sort-by-select" className="h-8">
								<SelectValue placeholder="Select..." />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">None</SelectItem>
								<SelectItem value="last-1">Past day</SelectItem>
								<SelectItem value="last-7">Past week</SelectItem>
								<SelectItem value="last-30">Past month</SelectItem>
								<SelectItem value="last-365">Past year</SelectItem>
								<SelectItem value="all">All</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>
			</div>
		</div>
	);
}

function ActionsList({
	space,
	onClose,
	onActionSelect,
}: {
	space: SpaceData;
	onClose: () => void;
	onActionSelect: (actionId: string) => void;
}) {
	// Use the actions from the view data
	const actions = space.actions || [];

	const handleAddAction = async () => {
		const newActionId = createId();
		// Navigate to the detail form for new action creation
		onActionSelect(newActionId);
	};

	const handleRemoveAction = async (actionId: string) => {
		try {
			await mutate.actions.delete(space.id, actionId);
			toast.success('Action removed successfully');
		} catch (error) {
			console.error('Failed to remove action:', error);
			toast.error('Failed to remove action');
		}
	};

	return (
		<div className="absolute right-0 top-0 z-20 w-[420px] pb-4 pl-4 pr-8">
			<div className="flex w-full flex-col gap-2 rounded-md bg-white p-4 shadow-3xl outline outline-1 outline-neutral-900/15">
				<div className="flex items-center gap-1">
					<div className="flex-1 font-medium leading-6">Actions</div>
					<Button size="icon" variant="ghost" className="size-6" onClick={onClose}>
						<RiCloseLine className="size-5" />
					</Button>
				</div>
				<div className="text-sm text-neutral-500">
					Automate tasks when emails arrive in this space
				</div>
				<div className="flex flex-col gap-1">
					{actions.length === 0 ? (
						<div className="py-4 text-center text-sm text-neutral-500">
							No actions configured yet
						</div>
					) : (
						actions.map((action) => (
							// biome-ignore lint/a11y/noStaticElementInteractions: Detected in Biome v2 upgrade, not sure why this is.
							<div
								key={action.id}
								className="flex cursor-pointer items-center gap-2 rounded-lg p-2 hover:bg-neutral-50"
								onClick={() => onActionSelect(action.id)}
								onKeyDown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										onActionSelect(action.id);
									}
								}}
							>
								<RiFlashlightLine className="size-4 text-neutral-500" />
								<div className="flex-1">
									<div className="text-sm font-medium">
										{action.triggerType === 'new_message'
											? 'New Message'
											: action.triggerType === 'manual'
												? 'Manual'
												: 'Scheduled'}
									</div>
									<div className="line-clamp-1 text-xs text-neutral-500">{action.prompt}</div>
								</div>
								<Button
									size="icon"
									variant="ghost"
									className="size-6"
									onClick={(e) => {
										e.stopPropagation();
										handleRemoveAction(action.id);
									}}
								>
									<RiSubtractLine className="size-5" />
								</Button>
							</div>
						))
					)}
				</div>
				<Button
					size="sm"
					variant="ghost"
					className="mt-2 justify-start gap-1.5"
					onClick={handleAddAction}
				>
					<RiAddLine className="size-4" />
					Add action
				</Button>
			</div>
		</div>
	);
}

const actionDetailsFormSchema = z.object({
	triggerType: z.enum(['new_message', 'manual', 'cron']),
	prompt: z.string().min(1, 'Action prompt is required'),
	cronSchedule: z.string().optional(),
});

type ActionDetailsFormData = z.infer<typeof actionDetailsFormSchema>;

function ActionDetailsForm({
	space,
	actionId,
	onClose,
}: {
	space: SpaceData;
	actionId: string;
	onClose: () => void;
}) {
	// Find the action in the view's actions array
	const action = space.actions?.find((a) => a.id === actionId);
	const isNewAction = !action;

	const actionDetailsForm = useForm<ActionDetailsFormData>({
		resolver: zodResolver(actionDetailsFormSchema),
		defaultValues: {
			triggerType: action?.triggerType || 'new_message',
			prompt: action?.prompt || '',
			cronSchedule: action?.cronSchedule || '',
		},
	});

	const watchTriggerType = actionDetailsForm.watch('triggerType');

	const onSubmit = async (data: ActionDetailsFormData) => {
		try {
			// Prepare the data, ensuring cronSchedule is null if not cron trigger
			const actionData = {
				...data,
				cronSchedule: data.triggerType === 'cron' ? data.cronSchedule : null,
			};

			if (isNewAction) {
				// Create new action
				const newAction = {
					id: actionId,
					spaceId: space.id,
					accountId: space.accountId,
					...actionData,
					cronSchedule: data.cronSchedule || null,
					createdAt: new Date(),
					updatedAt: new Date(),
				};
				await mutate.actions.create(space.id, newAction);
				toast.success('Action created successfully');
			} else {
				// Update existing action
				await mutate.actions.update(space.id, actionId, actionData);
				toast.success('Action updated successfully');
			}
			onClose();
		} catch (error) {
			console.error('Failed to save action:', error);
			toast.error('Failed to save action');
		}
	};

	return (
		<div className="absolute right-0 top-0 z-20 w-[420px] pb-4 pl-4 pr-8">
			<div className="flex w-full flex-col gap-2 rounded-md bg-white p-4 shadow-3xl outline outline-1 outline-neutral-900/15">
				<div className="flex items-center gap-1">
					<div className="flex-1 font-medium leading-6">
						{isNewAction ? 'New Action' : 'Edit Action'}
					</div>
					<Button size="icon" variant="ghost" className="size-6" onClick={onClose}>
						<RiCloseLine className="size-5" />
					</Button>
				</div>

				<Form {...actionDetailsForm}>
					<form onSubmit={actionDetailsForm.handleSubmit(onSubmit)} className="space-y-4">
						<FormField
							control={actionDetailsForm.control}
							name="triggerType"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="text-sm font-normal leading-snug text-neutral-500">
										Trigger
									</FormLabel>
									<Select onValueChange={field.onChange} defaultValue={field.value}>
										<FormControl>
											<SelectTrigger className="h-8">
												<SelectValue placeholder="Select trigger type" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value="new_message">New Message</SelectItem>
											<SelectItem value="manual">Manual</SelectItem>
											<SelectItem value="cron">Scheduled</SelectItem>
										</SelectContent>
									</Select>
								</FormItem>
							)}
						/>
						<FormField
							control={actionDetailsForm.control}
							name="prompt"
							render={({ field }) => (
								<FormItem className="flex flex-col">
									<FormLabel className="text-sm font-normal leading-snug text-neutral-500">
										Action Prompt
									</FormLabel>
									<FormControl>
										<textarea
											className="flex w-full rounded-lg border border-neutral-300 bg-transparent px-2 py-1 transition-colors placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950"
											placeholder="Describe what this action should do..."
											rows={4}
											{...field}
										/>
									</FormControl>
								</FormItem>
							)}
						/>
						{watchTriggerType === 'cron' && (
							<FormField
								control={actionDetailsForm.control}
								name="cronSchedule"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="text-sm font-normal leading-snug text-neutral-500">
											Cron Schedule
										</FormLabel>
										<FormControl>
											<Input
												className="h-8 px-2"
												placeholder="0 9 * * 1-5 (weekdays at 9am)"
												{...field}
											/>
										</FormControl>
										<p className="text-xs text-neutral-400">
											Use cron syntax: minute hour day month weekday
										</p>
									</FormItem>
								)}
							/>
						)}
						<div className="pt-2">
							<Button type="submit" className="w-full">
								{isNewAction ? 'Create Action' : 'Save Changes'}
							</Button>
						</div>
					</form>
				</Form>
			</div>
		</div>
	);
}
