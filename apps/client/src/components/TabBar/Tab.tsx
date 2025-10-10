import { RiCloseLine } from '@remixicon/react';
import { type Tab as TabType, useTabContext } from '../../contexts/TabContext.tsx';
import { cn } from '../../lib/util.ts';

interface TabProps {
	tab: TabType;
	hasNotification?: boolean;
}

export function Tab({ tab, hasNotification }: TabProps) {
	const { switchToTab, closeTab, tabs } = useTabContext();

	const handleClick = () => {
		if (!tab.isActive) {
			switchToTab(tab.id);
		}
	};

	const handleClose = (e: React.MouseEvent) => {
		e.stopPropagation();
		closeTab(tab.id);
	};

	const canClose = tabs.length > 1;

	return (
		<button
			type="button"
			className={cn(
				'group relative z-10 flex min-w-60 items-center justify-between rounded-t-xl px-2 py-1.5 text-sm font-medium transition-all',
				tab.isActive && [
					// Only active tabs get curves - both left and right
					'before:absolute before:bottom-0 before:left-[-8px] before:z-[-1] before:h-2 before:w-2 before:bg-[#E5E5E5]',
					'after:absolute after:bottom-0 after:right-[-8px] after:z-[-1] after:h-2 after:w-2 after:bg-[#E5E5E5]',
					'before:rounded-br-lg before:shadow-[4px_0_0_white]',
					'after:rounded-bl-lg after:shadow-[-4px_0_0_white]',
					'bg-white text-neutral-800',
				],
				!tab.isActive && 'text-neutral-500 hover:bg-white/50 hover:text-neutral-700',
			)}
			onClick={handleClick}
		>
			{/* Notification dot */}
			{hasNotification && (
				<span className="absolute left-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
			)}

			<span className={cn('flex-1 truncate pl-2 text-left', hasNotification && 'ml-2')}>
				{tab.title}
			</span>

			{canClose && (
				<button
					type="button"
					className={cn(
						'ml-2 flex-shrink-0 rounded p-0.5 transition-opacity hover:bg-black/10',
						tab.isActive ? 'opacity-60' : 'opacity-40',
					)}
					onClick={handleClose}
					title="Close tab"
				>
					<RiCloseLine className="h-3.5 w-3.5" />
				</button>
			)}
		</button>
	);
}
