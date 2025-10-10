import type { RemixiconComponentType } from '@remixicon/react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { useDocumentEventListener } from '../../hooks/useDocumentEventListener.ts';

type PageTitle = {
	text: string;
	Icon?: RemixiconComponentType;
};

type NavigationHistory = {
	to: string;
	ids: string[];
};

export type CommandPaletteView =
	| { type: 'root' }
	| { type: 'thread'; ids: string[] }
	| { type: 'thread.remind'; ids: string[] }
	| { type: 'thread.label'; ids: string[] }
	| { type: 'thread.spaces'; ids: string[] }
	| { type: 'label.create'; ids: string[]; labelName: string }
	| { type: 'settings' }
	| { type: 'settings.invite' }
	| { type: 'account.switch' }
	| { type: 'space.switch' }
	| { type: 'conversation.switch' };

const CONTEXT_DATA_ATTRIBUTE = 'data-current-context';
const CONTEXT_DATA_SELECTOR = `[${CONTEXT_DATA_ATTRIBUTE}]`;
function isContextDataAttributeMutation(mutation: MutationRecord): boolean {
	return mutation.type === 'attributes' && mutation.attributeName === CONTEXT_DATA_ATTRIBUTE;
}

const CommandPaletteContext = createContext<{
	isOpen: boolean;
	currentContext: CommandPaletteView;
	currentView: CommandPaletteView | null;
	pageView: CommandPaletteView;
	pageTitle: PageTitle | null;
	// Describes the current navigable list of thread IDs in list/table routes
	navigationHistory: NavigationHistory | null;
}>({
	isOpen: false,
	currentContext: { type: 'root' },
	currentView: null,
	pageTitle: null,
	pageView: { type: 'root' },
	navigationHistory: null,
});

// separate action context for components that don't need state
const CommandPaletteActionsContext = createContext<{
	setOpen: (to: boolean | CommandPaletteView) => void;
	setPageContext: ({ title, view }: { title: PageTitle | null; view: CommandPaletteView }) => void;
	// Sets the current navigable list of thread IDs for list/table routes
	setNavigationHistory: (prev: NavigationHistory | null) => void;
}>({
	setOpen: () => {},
	setPageContext: () => {},
	setNavigationHistory: () => {},
});

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
	const location = useLocation();
	const [contextElement, setContextElement] = useState<Element | null>(null);
	const [contextValue, setContextValue] = useState<CommandPaletteView | null>(null);
	const [state, setState] = useState<{
		currentView: CommandPaletteView | null;
		pageContext: { title: PageTitle | null; view: CommandPaletteView };
	}>({
		currentView: null,
		pageContext: { title: null, view: { type: 'root' } },
	});

	// Keep an independent navigation list of thread IDs for list/table routes.
	// This is intentionally not part of pageContext/state so that detail routes
	// can update the title without overwriting the navigation list.
	const [navigationHistory, setNavigationHistory] = useState<NavigationHistory | null>(null);

	// Keep contextValue up to date and in sync with the DOM. This updates the currentContext value
	// when the context element changes, using a MutationObserver.
	useEffect(() => {
		if (!contextElement) {
			setContextValue(null);
			return;
		}
		const updateContextValue = () => {
			const currentContext = contextElement.getAttribute(CONTEXT_DATA_ATTRIBUTE);
			if (currentContext) {
				setContextValue(JSON.parse(currentContext) as CommandPaletteView);
			} else {
				setContextValue(null);
			}
		};
		const observer = new MutationObserver((mutations) => {
			if (mutations.some(isContextDataAttributeMutation)) {
				updateContextValue();
			}
		});
		observer.observe(contextElement, {
			attributes: true,
			attributeFilter: [CONTEXT_DATA_ATTRIBUTE],
		});
		updateContextValue();
		return () => observer.disconnect();
	}, [contextElement]);

	const currentContext = state.currentView || contextValue || state.pageContext.view;

	const setCurrentView = useCallback((currentView: CommandPaletteView | null) => {
		setState((state) => ({ ...state, currentView }));
	}, []);

	const setPageContext = useCallback(
		({ title, view }: { title: PageTitle | null; view: CommandPaletteView }) => {
			setState((state) => ({ ...state, pageContext: { title, view } }));
		},
		[],
	);

	const setOpen = useCallback(
		(to: boolean | CommandPaletteView) => {
			if (to === true) {
				setCurrentView(currentContext);
			} else if (to === false) {
				setCurrentView(null);
			} else {
				setCurrentView(to);
			}
		},
		[currentContext, setCurrentView],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Intentional - only close on pathname change.
	useEffect(() => {
		if (state.currentView) {
			setOpen(false);
		}
	}, [location.pathname]);

	// Clear thread navigation list on route changes, except when viewing a thread detail page.
	useEffect(() => {
		const path = location.pathname || '';
		if (path.startsWith('/threads/')) {
			return; // preserve navigation list for thread details
		}
		setNavigationHistory(null);
	}, [location.pathname]);

	useDocumentEventListener('focusout', () => {
		setContextElement(null);
	});

	useDocumentEventListener('focusin', () => {
		const activeElement = document.activeElement;
		if (!activeElement) {
			setContextElement(null);
			return;
		}
		const contextEl = lookupCurrentContextElement(activeElement as Element);
		setContextElement(contextEl);
	});

	function lookupCurrentContextElement(initialElement: Element): Element | null {
		let element: Element | null = initialElement;
		do {
			if (element.matches(CONTEXT_DATA_SELECTOR)) {
				return element;
			}
			element = element.closest(CONTEXT_DATA_SELECTOR);
		} while (element);
		return null;
	}

	return (
		<CommandPaletteContext.Provider
			value={{
				isOpen: state.currentView !== null,
				currentContext,
				currentView: state.currentView,
				pageView: state.pageContext.view,
				pageTitle: state.pageContext.title,
				navigationHistory,
			}}
		>
			<CommandPaletteActionsContext.Provider
				value={{
					setOpen,
					setPageContext,
					setNavigationHistory,
				}}
			>
				{children}
			</CommandPaletteActionsContext.Provider>
		</CommandPaletteContext.Provider>
	);
}

export function useCommandPalette() {
	return useContext(CommandPaletteContext);
}

export function useCommandPaletteActions() {
	return useContext(CommandPaletteActionsContext);
}
