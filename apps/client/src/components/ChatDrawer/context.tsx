import { createContext, useCallback, useContext, useMemo, useState } from 'react';

type ChatDrawerState = {
	isOpen: boolean;
	conversationId: string | null;
};

const ChatDrawerContext = createContext<ChatDrawerState>({
	isOpen: false,
	conversationId: null,
});

const ChatDrawerActionsContext = createContext<{
	open: (conversationId: string) => void;
	close: () => void;
	setOpen: (open: boolean, conversationId?: string | null) => void;
}>({
	open: () => {},
	close: () => {},
	setOpen: () => {},
});

export function ChatDrawerProvider({ children }: { children: React.ReactNode }) {
	const [state, setState] = useState<ChatDrawerState>({ isOpen: false, conversationId: null });

	const open = useCallback((conversationId: string) => {
		setState({ isOpen: true, conversationId });
	}, []);

	const close = useCallback(() => {
		setState((prev) => ({ ...prev, isOpen: false }));
	}, []);

	const setOpen = useCallback((open: boolean, conversationId?: string | null) => {
		setState((prev) => ({ isOpen: open, conversationId: conversationId ?? prev.conversationId }));
	}, []);

	const actions = useMemo(() => ({ open, close, setOpen }), [open, close, setOpen]);

	return (
		<ChatDrawerContext.Provider value={state}>
			<ChatDrawerActionsContext.Provider value={actions}>
				{children}
			</ChatDrawerActionsContext.Provider>
		</ChatDrawerContext.Provider>
	);
}

export function useChatDrawer() {
	return useContext(ChatDrawerContext);
}

export function useChatDrawerActions() {
	return useContext(ChatDrawerActionsContext);
}
