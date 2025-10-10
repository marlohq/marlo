import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useCommandPalette } from '../components/CommandPalette/context.tsx';

export interface Tab {
	id: string;
	title: string;
	route: string;
	isActive: boolean;
}

interface TabContextType {
	tabs: Tab[];
	activeTabId: string;
	createTab: () => void;
	closeTab: (tabId: string) => void;
	switchToTab: (tabId: string) => void;
}

const TabContext = createContext<TabContextType | null>(null);

interface TabProviderProps {
	children: ReactNode;
}

// Helper function to create default tab
const defaultTab = (): Tab => ({
	id: 'tab-1',
	title: 'Priority inbox',
	route: '/',
	isActive: true,
});

export function TabProvider({ children }: TabProviderProps) {
	const navigate = useNavigate();
	const location = useLocation();
	const { pageTitle } = useCommandPalette();

	// Initialize with one tab
	const [tabs, setTabs] = useState<Tab[]>([defaultTab()]);

	const [activeTabId, setActiveTabId] = useState('tab-1');

	// Sync current route with active tab and update title
	useEffect(() => {
		setTabs((prevTabs) =>
			prevTabs.map((tab) =>
				tab.id === activeTabId
					? {
							...tab,
							route: location.pathname,
							// Use pageTitle from context if available, otherwise keep existing title
							title: pageTitle?.text || tab.title,
						}
					: tab,
			),
		);
	}, [location.pathname, activeTabId, pageTitle]);

	const createTab = useCallback(() => {
		const newTabId = `tab-${Date.now()}`;
		const newTab: Tab = {
			...defaultTab(),
			id: newTabId,
			isActive: false,
		};

		setTabs((prevTabs) => [
			...prevTabs.map((tab) => ({ ...tab, isActive: false })),
			{ ...newTab, isActive: true },
		]);

		setActiveTabId(newTabId);
		navigate('/');
	}, [navigate]);

	const closeTab = useCallback(
		(tabId: string) => {
			setTabs((prevTabs) => {
				const filteredTabs = prevTabs.filter((tab) => tab.id !== tabId);

				// Don't allow closing the last tab
				if (filteredTabs.length === 0) {
					return prevTabs;
				}

				// If we're closing the active tab, switch to the last remaining tab
				if (tabId === activeTabId) {
					const lastTab = filteredTabs[filteredTabs.length - 1];
					if (lastTab) {
						setActiveTabId(lastTab.id);
						navigate(lastTab.route);

						return filteredTabs.map((tab) => ({
							...tab,
							isActive: tab.id === lastTab.id,
						}));
					}
				}

				return filteredTabs;
			});
		},
		[activeTabId, navigate],
	);

	const switchToTab = useCallback(
		(tabId: string) => {
			const targetTab = tabs.find((tab) => tab.id === tabId);
			if (!targetTab) return;

			setTabs((prevTabs) =>
				prevTabs.map((tab) => ({
					...tab,
					isActive: tab.id === tabId,
				})),
			);

			setActiveTabId(tabId);
			navigate(targetTab.route);
		},
		[tabs, navigate],
	);

	const contextValue: TabContextType = {
		tabs,
		activeTabId,
		createTab,
		closeTab,
		switchToTab,
	};

	return <TabContext.Provider value={contextValue}>{children}</TabContext.Provider>;
}

export function useTabContext() {
	const context = useContext(TabContext);
	if (!context) {
		throw new Error('useTabContext must be used within a TabProvider');
	}
	return context;
}
