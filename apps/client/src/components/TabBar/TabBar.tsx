import { RiAddLine } from '@remixicon/react';
import { useTabContext } from '../../contexts/TabContext.tsx';
import { cn } from '../../lib/util.ts';
import { Tab } from './Tab.tsx';

export function TabBar() {
	const { tabs, createTab } = useTabContext();

	// For now, no notifications - this can be connected to real data later
	const getTabNotifications = (tabId: string) => {
		return false;
	};

	return (
		<div
			className="relative flex items-center bg-[#E5E5E5] pl-20 pt-2"
			style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
		>
			<div
				className="relative flex items-center gap-1 overflow-x-auto px-4"
				style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
			>
				{tabs.map((tab) => (
					<Tab key={tab.id} tab={tab} hasNotification={getTabNotifications(tab.id)} />
				))}

				<button
					type="button"
					className={cn(
						'flex-shrink-0 p-2 text-neutral-500 transition-colors',
						'hover:bg-white/50 hover:text-neutral-700',
						'ml-1',
					)}
					onClick={createTab}
					title="New tab"
				>
					<RiAddLine className="h-4 w-4" />
				</button>
			</div>
		</div>
	);
}
