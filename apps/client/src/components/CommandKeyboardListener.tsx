import { invariant } from 'es-toolkit';
import { type Command, isKeyEventMatch } from '../commands/util.js';
import { useDocumentEventListener } from '../hooks/useDocumentEventListener.js';

// Import all of the commands from the 'src/client/commands' directory.
const allCommandModules = import.meta.glob('../commands/commands/*.ts', { eager: true });
const allCommands: Command[] = Object.entries(allCommandModules).map(([key, m]) => {
	const isValidModule = typeof m === 'object' && m !== null && 'default' in m;
	invariant(isValidModule, `Command ${key} has no default export.`);
	return (m as { default: Command }).default;
});

export function CommandKeyboardListener() {
	return allCommands.map(
		(cmd) =>
			cmd.shortcut && (
				<CommandBinding
					key={`${cmd.shortcut.key}${cmd.shortcut.modifiers.join('+')}`}
					command={cmd}
				/>
			),
	);
}

function CommandBinding({ command }: { command: Command }) {
	const action = command.useAction()();
	useDocumentEventListener('keydown', (event) => {
		if (!command.shortcut) return;
		if (action.shouldHandle && !action.shouldHandle()) return;
		if (isKeyEventMatch(event, command.shortcut)) {
			event.preventDefault();
			action.run();
		}
	});
	return null;
}
