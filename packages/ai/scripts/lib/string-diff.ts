import chalk from 'chalk';
import { type Change, diffLines } from 'diff';

/**
 * Compare two strings and display their differences in a readable format
 *
 * @param {string} string1 - The first string to compare
 * @param {string} string2 - The second string to compare
 * @param {Object} options - Optional configuration
 * @param {boolean} options.showLineNumbers - Whether to display line numbers (default: false)
 * @param {boolean} options.ignoreWhitespace - Whether to ignore whitespace changes (default: false)
 * @param {boolean} options.ignoreCase - Whether to ignore case changes (default: false)
 */
function diffStrings(
	string1: string,
	string2: string,
	options: {
		showLineNumbers?: boolean;
		ignoreWhitespace?: boolean;
		ignoreCase?: boolean;
	} = {},
) {
	const { showLineNumbers = false, ignoreWhitespace = false, ignoreCase = false } = options;

	// Normalize strings if needed
	let str1 = string1;
	let str2 = string2;

	if (ignoreCase) {
		str1 = str1.toLowerCase();
		str2 = str2.toLowerCase();
	}

	if (ignoreWhitespace) {
		str1 = str1.replace(/\s+/g, ' ').trim();
		str2 = str2.replace(/\s+/g, ' ').trim();
	}

	// Perform line-by-line diff
	const changes = diffLines(str1, str2);

	const lineNum1 = 0;
	const lineNum2 = 0;

	// biome-ignore lint/suspicious/noConsole: script
	console.log(chalk.bold('String Difference:'));
	// biome-ignore lint/suspicious/noConsole: script
	console.log('-'.repeat(50));

	for (const change of changes) {
		const prefix = change.added ? '+' : change.removed ? '-' : ' ';
		const color = change.added ? chalk.green : change.removed ? chalk.red : chalk.gray;

		const lines = change.value.split('\n').filter((line) => line.length > 0 || line === '');

		for (let line of lines) {
			// If the line ends with a newline character in the original string, it was a complete line
			// biome-ignore lint/style/useTemplate: its fine
			const isCompleteLine = change.value.includes(line + '\n') || change.value.endsWith(line);

			if (!isCompleteLine && line !== '') {
				line += ' [No newline]';
			}

			let lineDisplay = line;

			if (showLineNumbers) {
				const displayNum = change.added
					? String(lineNum2).padStart(4)
					: change.removed
						? String(lineNum1).padStart(4)
						: `${String(lineNum1).padStart(4)},${String(lineNum2).padStart(4)}`;
				lineDisplay = `${displayNum} | ${lineDisplay}`;
			}

			// biome-ignore lint/suspicious/noConsole: script
			console.log(color(`${prefix} ${lineDisplay}`));
		}
	}

	// biome-ignore lint/suspicious/noConsole: script
	console.log('-'.repeat(50));
	// biome-ignore lint/suspicious/noConsole: script
	console.log(chalk.bold(`Summary: ${diffSummary(changes)}`));
}

/**
 * Generate a summary of the differences
 *
 * @param {Array} changes - Array of changes from diff.js
 * @returns {string} Summary message
 */
function diffSummary(changes: Change[]) {
	let additions = 0;
	let deletions = 0;

	for (const change of changes) {
		const lineCount = (change.value.match(/\n/g) || []).length;

		if (change.added) {
			additions += lineCount || 1;
		} else if (change.removed) {
			deletions += lineCount || 1;
		}
	}

	return `${additions} addition${additions !== 1 ? 's' : ''}, ${deletions} deletion${deletions !== 1 ? 's' : ''}`;
}

// Export for use as a module
export { diffStrings };
