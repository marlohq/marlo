import { Dialog, DialogContent } from '@workspace/ui';
import { useRef } from 'react';
import { useDocumentEventListener } from '../../hooks/useDocumentEventListener.ts';
import { AccountSettingsCommandView } from './AccountSettingsCommandView.tsx';
import { AccountSwitchCommandView } from './AccountSwitchCommandView.tsx';
import { ConversationSwitchCommandView } from './ConversationSwitchCommandView.tsx';
import { CreateLabelCommandView } from './CreateLabelCommandView.tsx';
import { useCommandPalette, useCommandPaletteActions } from './context.tsx';
import { InviteCommandDialog } from './InviteCommandDialog.tsx';
import { RootCommandView } from './RootCommandView.tsx';
import { SpaceSwitchCommandView } from './SpaceSwitchCommandView.tsx';
import { ThreadCommandView } from './ThreadCommandView.tsx';
import { ThreadLabelsCommandView } from './ThreadLabelsCommandView.tsx';
import { ThreadRemindCommandView } from './ThreadRemindCommandView.tsx';
import { ThreadSpacesCommandView } from './ThreadSpacesCommandView.tsx';

export function CommandPalette() {
	const { isOpen, currentView: view } = useCommandPalette();
	const { setOpen } = useCommandPaletteActions();
	const previouslyFocusedElement = useRef<HTMLElement | null>(null);

	useDocumentEventListener('keydown', (e) => {
		if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			handleOpenChange(true);
		}
	});

	function handleOpenChange(open: boolean) {
		setOpen(open);
		if (open) {
			previouslyFocusedElement.current = document.activeElement as HTMLElement;
		} else {
			previouslyFocusedElement.current?.focus();
			previouslyFocusedElement.current = null;
		}
	}

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange}>
			<DialogContent hideCloseButton={true} className="overflow-hidden p-0 shadow-2xl" offset="top">
				{view?.type === 'root' && <RootCommandView />}
				{view?.type === 'thread' && <ThreadCommandView ids={view.ids} />}
				{view?.type === 'thread.remind' && <ThreadRemindCommandView ids={view.ids} />}
				{view?.type === 'thread.label' && <ThreadLabelsCommandView ids={view.ids} />}
				{view?.type === 'thread.spaces' && <ThreadSpacesCommandView ids={view.ids} />}
				{view?.type === 'label.create' && (
					<CreateLabelCommandView ids={view.ids} labelName={view.labelName} />
				)}
				{view?.type === 'settings' && <AccountSettingsCommandView />}
				{view?.type === 'settings.invite' && <InviteCommandDialog />}
				{view?.type === 'account.switch' && <AccountSwitchCommandView />}
				{view?.type === 'conversation.switch' && <ConversationSwitchCommandView />}
				{view?.type === 'space.switch' && <SpaceSwitchCommandView />}
			</DialogContent>
		</Dialog>
	);
}
