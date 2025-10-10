import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createId } from '@workspace/core/util.js';
import { blue, dim, red, yellow } from 'kleur/colors';
import { type Logger, type Message, ROARR, Roarr } from 'roarr';
import { serializeError } from 'serialize-error';
import type { JsonObject } from './json.ts';

/**
 * Like JsonObject, but with a special-case for when an error is passed to become more lax with
 * error serialization for the `error` key. This Union type behaves differently than you might
 * think: the "error" key is a special case on the JSON object, but other keys can also exist.
 */
export type JsonObjectWithErrorSupport = { error: unknown } | JsonObject;
export type { Logger };

// This logger is currently designed for the backend (Node.js, and potentially others).
// We throw here in case it has been accidentally imported as a frontend, browser logger.
if (typeof process !== 'object') {
	throw new Error('@workspace/core/logger was imported in the browser. This is not allowed.');
}

// Create a unique ID for the lifetime of the current process.
const PROCESS_ID = createId();

function formatTimestamp(timestamp: number) {
	const date = new Date(timestamp);
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	const seconds = String(date.getSeconds()).padStart(2, '0');
	return `${hours}:${minutes}:${seconds}`;
}

// In development, we log to both the console and a file for easier debugging.
// No one wants to dig through a million JSON objects in the terminal.
if (process.env.NODE_ENV === 'development') {
	// Prepare a new `./logs/*` file for logging.
	mkdirSync('./logs', { recursive: true });
	const logOutputFile = `./logs/${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
	writeFileSync(logOutputFile, '');
	// Override ROARR.write() to create our own custom dev logger.
	ROARR.write = (messageString: string) => {
		// NOTE: It's okay to assume the TS interface here because its contracted
		// from roarr. Plus this is dev-only code.
		const message = JSON.parse(messageString) as {
			context: { logLevel: number; namespace?: string };
			time: number;
			message: string;
		};
		// NOTE(fks, 2024-03-29): Roarr sets a maximum breadth of 20 for the context object to
		// prevent the footgun of logging too much. If we log more than 20 keys in the context
		// object, we will lose some of them to truncation.
		// We don't really want this, but it's the hardcoded default. If needed in the future,
		// we can override the default serializer to skip this hardcoded check.
		// See: https://github.com/gajus/roarr/blob/main/src/utilities/stringify.ts
		if (Object.keys(message.context).length >= 20) {
			// biome-ignore lint/suspicious/noConsole: Allowed inside the logger.
			console.error(
				'@workspace/core/logger context object has 20+ keys. Some keys will be truncated in production.',
			);
		}
		// Log the formatted message to dev. Matches the Astro debug log format.
		const messageParts = [];
		messageParts.push(dim(formatTimestamp(message.time)));
		if (message.context.namespace) {
			messageParts.push(blue(`[${message.context.namespace}]`));
		}
		if (message.context.logLevel >= 50) {
			messageParts.push(red('[ERROR]'));
		} else if (message.context.logLevel >= 40) {
			messageParts.push(yellow('[WARN]'));
		}
		messageParts.push(message.message);
		messageParts.push(dim(JSON.stringify(message.context)));

		// Ignore low-level debug messages, anything below the INFO level (30).
		// You can change this to debug an issue in the console during development,
		// but it's often easier to use the log output file instead.
		if (message.context.logLevel >= 30) {
			// biome-ignore lint/suspicious/noConsole: Allowed inside the logger.
			console.log(messageParts.join(' '));
		}
		// Log all messages (all log levels) out to a file.
		appendFileSync(logOutputFile, `${messageParts.join(' ')}\n`);
	};
}

function errorMiddleware() {
	return (message: Message) => {
		message.context.error &&= serializeError(message.context.error);
		return message;
	};
}

function createLogger(globalContext: JsonObject): Logger<JsonObjectWithErrorSupport> {
	return (
		Roarr
			// Include the provided global context on every log message.
			// Include our own processId for easier debugging across machine restarts.
			.child({
				processId: PROCESS_ID,
				...globalContext,
				//
			})
			// Include the errorMiddleware to serialize Error objects in the context.
			.child(errorMiddleware())
	);
}

/**
 * Set the global logger context if needed, often at the start of your program.
 *
 * We aim for "wide events" in our logging systems, which means that it is correct and useful to set
 * common global metadata like service name, region, etc. See:
 * https://isburmistrov.substack.com/p/all-you-need-is-wide-events-not-metrics
 *
 * You can also use logger.adopt() in your application to attach additional context to every log
 * message during the lifecycle of a request or other operation, using AsyncLocalStorage.
 */
export function setGlobalContext(globalContext: JsonObject) {
	logger = createLogger(globalContext);
}

/**
 * The global logger. By default, you should always use this over console.log, etc.
 *
 * NOTE: Always use the logger directly from the `import {logger}` binding. Calling
 * `setGlobalContext()` will create a new instance of the logger. ESM has live import bindings, so
 * you shouldn't need to worry about an outdated reference to the old logger instance. However,
 * storing the logger in a closure or other long-lived scope will break this assumption.
 */
export let logger = createLogger({});
