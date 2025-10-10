import { Command, CommandGroup, CommandInput, CommandList } from '@workspace/ui';
import { invariant } from 'es-toolkit';
import { useState } from 'react';
import { forwardCommand } from '../../commands/commands/forward.ts';
import { manageLabelsCommand } from '../../commands/commands/manageLabels.ts';
import { markAsReadCommand } from '../../commands/commands/markAsRead.ts';
import { markAsSpamCommand } from '../../commands/commands/markAsSpam.ts';
import { moveToPriorityCommand } from '../../commands/commands/moveToPriority.ts';
import { moveToSpaceCommand } from '../../commands/commands/moveToSpace.ts';
import { openInGmailCommand } from '../../commands/commands/openInGmail.ts';
import { printCommand } from '../../commands/commands/print.ts';
import { remindCommand } from '../../commands/commands/remind.ts';
import { replyCommand } from '../../commands/commands/reply.ts';
import { replyAllCommand } from '../../commands/commands/replyAll.ts';
import { resolveCommand } from '../../commands/commands/resolve.ts';
import { trashCommand } from '../../commands/commands/trash.ts';
import { useThreads } from '../../threads/hooks.ts';
import { BasicCommandItem, CommandViewFooter } from './CommandView.tsx';
import { SharedRootCommands } from './RootCommandView.tsx';

export function ThreadCommandView({ ids }: { ids: string[] }) {
	invariant(ids.length > 0, 'ThreadCommandView: ids must be a non-empty array');
	const [search, setSearch] = useState('');
	const threads = useThreads(ids);
	const resolveAction = resolveCommand.useAction();
	const moveToPriorityAction = moveToPriorityCommand.useAction();
	const moveToSpaceAction = moveToSpaceCommand.useAction();
	const remindAction = remindCommand.useAction();
	const spamAction = markAsSpamCommand.useAction();
	const manageLabelsAction = manageLabelsCommand.useAction();
	const openInGmailAction = openInGmailCommand.useAction();
	const printAction = printCommand.useAction();
	const markAsReadAction = markAsReadCommand.useAction();
	const trashAction = trashCommand.useAction();
	const replyAction = replyCommand.useAction();
	const replyAllAction = replyAllCommand.useAction();
	const forwardAction = forwardCommand.useAction();

	return (
		<Command>
			<CommandInput
				value={search}
				onValueChange={setSearch}
				autoFocus
				placeholder={'Type a command or search...'}
			/>
			<CommandList>
				<CommandGroup heading="Actions">
					<BasicCommandItem command={resolveCommand} action={resolveAction(threads)} />
					<BasicCommandItem
						command={moveToPriorityCommand}
						action={moveToPriorityAction(threads)}
					/>
					<BasicCommandItem
						command={moveToSpaceCommand}
						action={moveToSpaceAction(threads)}
						closeOnSelect={false}
					/>
					<BasicCommandItem
						command={remindCommand}
						action={remindAction(threads)}
						closeOnSelect={false}
						keywords={['snooze']}
					/>
					<BasicCommandItem command={markAsReadCommand} action={markAsReadAction(threads)} />
					<BasicCommandItem command={markAsSpamCommand} action={spamAction(threads)} />
					<BasicCommandItem command={trashCommand} action={trashAction(threads)} />
				</CommandGroup>
				<CommandGroup heading="Mail">
					<BasicCommandItem command={replyCommand} action={replyAction(threads)} />
					<BasicCommandItem command={replyAllCommand} action={replyAllAction(threads)} />
					<BasicCommandItem command={forwardCommand} action={forwardAction(threads)} />
					<BasicCommandItem command={printCommand} action={printAction(threads)} />
					<BasicCommandItem
						command={manageLabelsCommand}
						action={manageLabelsAction(threads)}
						closeOnSelect={false}
					/>
					<BasicCommandItem command={openInGmailCommand} action={openInGmailAction(threads)} />
				</CommandGroup>
				<SharedRootCommands />
			</CommandList>
			<CommandViewFooter threads={threads} />
		</Command>
	);
}
