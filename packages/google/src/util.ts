import { decodeHTML } from 'entities/decode';

/**
 * Text previews from Gmail may include special whitespace characters not covered by `.trim()`. This
 * function removes all such characters.
 */
export function trimAllWhitespace(text: string) {
	return text.replace(
		// biome-ignore lint/suspicious/noMisleadingCharacterClass: Allow special char codes for regex
		/^[\u200B-\u200D\uFEFF\u0020\u00A0\u034F\s]+|[\u200B-\u200D\uFEFF\u0020\u00A0\u034F\s]+$/g,
		'',
	);
}

/** Gmail snippets, unlike subjects, content etc, are HTML encoded. */
export function decodeEntities(text: string) {
	return decodeHTML(text);
}
