import type { ComponentType } from 'react';
import { useCommandPalette } from '../components/CommandPalette/context.tsx';
import { useThreads } from '../threads/hooks.ts';
import type { ClientThread } from '../threads/model.ts';

export type KeyboardModifier = 'CommandOrControl' | 'Control' | 'Alt' | 'Shift';

// biome-ignore lint/suspicious/noExplicitAny: Correct use of any as a type parameter
export type AnyCommandArgs = Array<any>;

/**
 * Command -- an isolated piece of logic that lives in the Command Palette and can often be
 * triggered by a keyboard shortcut or button in the UI.
 *
 * As a best practice, most new functionality in the Marlo client should be implemented first as a
 * command in the Command Palette, and only later be added directly to the application UI.
 */
export type Command<CommandArgs extends AnyCommandArgs = []> = {
	/** The keyboard shortcut that will be used to trigger the command. */
	shortcut: CommandShortcut | null;
	/** The icon to represent the command in UI. */
	icon: ComponentType<{ className?: string }>;
	/** The logic that will be executed when the command is triggered. */
	useAction: () => (...args: CommandArgs) => CommandAction;
};

/**
 * Command Action -- the logic of a command, executed when the command is triggered. An action is
 * often created with any required contextual data (via command.useAction(...) arguments) so that
 * that data can be read from context and does not need to be passed to the individual methods.
 */
export type CommandAction = {
	run: () => void | Promise<void>;
	label: () => string;
	/** If provided, the keyboard shortcut will only trigger the command if this function returns true. */
	shouldHandle?: () => boolean;
};

/**
 * Command Shortcut -- the definition of an optional keyboard shortcut that can be used to trigger a
 * command. All modifiers must be matched for the command to trigger.
 */
type CommandShortcut = {
	key: string;
	modifiers: KeyboardModifier[];
	/** If true, the command triggers even if an input field has focus (ex: CMD+K, CMD+P). */
	global?: boolean;
};

export function defineCommand<CommandArgs extends AnyCommandArgs, K extends Command<CommandArgs>>(
	command: K,
): K {
	return command;
}

export function useThreadsFromContext(): ClientThread[] | null {
	const { currentContext } = useCommandPalette();
	const ids = currentContext.type === 'thread' ? currentContext.ids : [];
	const threads = useThreads(ids);
	return threads;
}

function isMac(): boolean {
	return /Macintosh/.test(navigator.userAgent) || navigator.platform.includes('Mac');
}

export function mapModifier(modifier: KeyboardModifier): 'Meta' | 'Control' | 'Alt' | 'Shift' {
	switch (modifier) {
		case 'CommandOrControl':
			return isMac() ? 'Meta' : 'Control';
		default:
			return modifier;
	}
}

const allModifiers = ['Meta', 'Control', 'Alt', 'Shift'] as const;

export function isInputField(event: KeyboardEvent): boolean {
	if (!(event.target instanceof HTMLElement)) return false;
	const target = event.target as HTMLElement;
	return !!target.closest('input, textarea, select, .composer-editor');
}

export function isKeyEventMatch(event: KeyboardEvent, shortcut: CommandShortcut) {
	if (!shortcut.global && isInputField(event)) {
		return false;
	}
	return isShortcutMatch(event, shortcut);
}

function isShortcutMatch(event: KeyboardEvent, shortcut: CommandShortcut): boolean {
	if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) return false;

	const expectedModifiers = shortcut.modifiers?.map(mapModifier);
	// Ensure that, if a modifier is pressed, then it *should* be pressed.
	// Ex: "cmd + r" should not match against the "r" shortcut.
	const onlyExpectedModifiersArePressed = allModifiers.every((modifier) => {
		const pressed = event.getModifierState(modifier);
		const shouldBePressed = expectedModifiers?.includes(modifier) ?? false;
		return pressed === shouldBePressed;
	});

	return onlyExpectedModifiersArePressed;
}
