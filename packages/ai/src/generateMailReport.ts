import { logger as baseLogger } from '@workspace/core/logger.js';
import type { Mail } from '@workspace/core/mail-parser.ts';
import type { MailReport } from '@workspace/core/types.js';
import { generateText } from 'ai';
import { collapseWhiteSpace } from 'collapse-white-space';
import * as htmlparser2 from 'htmlparser2';
import sanitizeHtml from 'sanitize-html';
import { MODELS } from './util.ts';

const logger = baseLogger.child({ namespace: 'ai' });

function stripMessageContentForPrompt(content: string) {
	return collapseWhiteSpace(
		sanitizeHtmlForMarkdown(
			sanitizeHtml(content, {
				// Allow images and links, but remove all other attributes
				allowedAttributes: { img: ['alt', 'src'], a: ['href'] },
				// Remove empty elements, after sanitization
				exclusiveFilter: (frame) => {
					return !frame.text.trim();
				},
			}),
		),
		{
			style: 'html',
			trim: true,
		},
	).replaceAll('<p></p>', '');
}

function formatRecipient(recipient: { address: string; name?: string }): string {
	if (recipient.name) {
		return `${recipient.name} <${recipient.address}>`;
	}
	return recipient.address;
}

export async function generateMailReport({
	messageId,
	mail,
}: {
	messageId: string;
	mail: Mail;
}): Promise<MailReport> {
	const cleanHtml = mail.html
		? stripMessageContentForPrompt(mail.html)
		: (mail.text ?? 'No Message Body Found.');
	const reportHeader = `# ${mail.subject || 'Unknown Subject'}

## Message Details
- Subject: ${mail.subject || 'Unknown Subject'}
- Date: ${mail.date || 'Unknown Date'}
- From: ${mail.from?.text || 'Unknown Sender'}
- Reply-To: ${mail.replyTo?.map((t) => t.text).join(', ') || 'None'}
- To: ${mail.to?.map((t) => formatRecipient(t)).join(', ') || 'None'}
- Cc: ${mail.cc?.map((c) => formatRecipient(c)).join(', ') || 'None'}
- Bcc: ${mail.bcc?.map((b) => formatRecipient(b)).join(', ') || 'None'}
- List-ID: ${mail.headers['list-id'] || 'None'}
`;

	const timer = performance.now();
	let result;
	let usage;
	try {
		const response = await generateText({
			model: MODELS['gemini-2.0-flash'],
			prompt: `
## YOUR TASK:
Generate a complete plaintext version of the email body content. Include all relevant URLs and links in the plaintext output. Ensure that no relevant content is omitted. Do not summarize or editorialize. If the provided plaintext version is already a complete representation of the email, return exactly "COMPLETE".

IMPORTANT: Your response should contain ONLY the email body content (or "COMPLETE"), nothing else.

## CONTEXT (for your understanding only - DO NOT include in output):

### Email Details
${reportHeader}

### Email Body (HTML)
\`\`\`html
${cleanHtml}
\`\`\`

### Email Body (Plaintext)
\`\`\`text
${mail.text}
\`\`\`
`,
		});
		result = response.text;
		usage = response.usage;
	} catch (error) {
		// Sanitize the error to prevent logging user email content
		const sanitizedError = new Error(
			`AI generation failed for message ${messageId}: ${error instanceof Error ? error.message : String(error)}`,
		);
		if (error instanceof Error && error.stack) {
			sanitizedError.stack = error.stack;
		}
		logger.error({ messageId, error: sanitizedError }, 'Failed to generate mail report');
		throw sanitizedError;
	}
	logger.debug({ messageId, duration: performance.now() - timer, usage }, 'mail report generated');

	// If the AI returns "COMPLETE", use the original plain text
	if (result.trim() === 'COMPLETE') {
		return mail.text || 'No Message Body Found.';
	}

	return result;
}

// Tags that are generally relevant for Markdown conversion
const ALLOWED_TAGS = new Set([
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6', // Headings
	'p', // Paragraphs
	'a', // Links
	'img', // Images
	'ul',
	'ol',
	'li', // Lists
	'blockquote', // Blockquotes
	'code',
	'pre', // Code blocks and inline code
	'strong',
	'b', // Bold
	'em',
	'i', // Italic
	'del',
	's',
	'strike', // Strikethrough
	'hr', // Horizontal rules
	'br', // Line breaks
	'table',
	'thead',
	'tbody',
	'tfoot', // Table structure (TOP LEVEL ONLY)
	'tr',
	'th',
	'td', // Table rows and cells (TOP LEVEL ONLY)
]);

// Attributes to keep for specific tags
const ALLOWED_ATTRIBUTES: { [tagName: string]: Set<string> } = {
	a: new Set(['href']),
	img: new Set(['src', 'alt']),
	// Attributes for table elements will be stripped later if needed,
	// but the tags themselves are handled by the nesting logic now.
};

// Tags whose content should be completely ignored (like scripts, styles)
const TAGS_TO_SKIP_CONTENT = new Set([
	'script',
	'style',
	'iframe',
	//   'noscript', // Often contains fallback content that might be useful? Keep for now.
	'button',
	'select',
	'textarea',
	'form',
	'head',
	'meta',
	'link',
]);

// HTML void elements (self-closing)
const VOID_TAGS = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr',
]);

// Set of all table-related tags for easy checking
const TABLE_TAGS = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td']);

// --- Helper Functions ---

// Basic HTML entity escaping for text content
function escapeHtml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Basic HTML entity escaping for attribute values
function escapeAttribute(attrName: string, value: string): string {
	if (attrName === 'href' && value.length > 160) {
		return `${value.slice(0, 100)}...`;
	}
	return value;
}

// --- Sanitizer Function ---

function sanitizeHtmlForMarkdown(html: string): string {
	let sanitizedHtml = '';
	let skipContentLevel = 0; // Counter for nested tags like <script>, <style>
	let insideTableCellLevel = 0; // Counter for nesting level within <td> or <th>

	const parser = new htmlparser2.Parser(
		{
			onopentag(name, attribs) {
				// --- Tag Skipping Logic ---

				// 1. Skip based on TAGS_TO_SKIP_CONTENT
				if (TAGS_TO_SKIP_CONTENT.has(name)) {
					skipContentLevel++;
					return; // Don't output the tag or process its attributes/content
				}
				if (skipContentLevel > 0) {
					return; // We are inside a tag whose content is being skipped
				}

				// 2. Skip table-related tags if nested inside a <td> or <th>
				const isTableTag = TABLE_TAGS.has(name);
				if (isTableTag && insideTableCellLevel > 0) {
					// This is a nested table tag, skip outputting it.
					// Content inside will still be processed by ontext unless skipped by rule #1.
					// We still need to track entering/exiting potential 'td'/'th' within this skipped structure.
					if (name === 'td' || name === 'th') {
						insideTableCellLevel++;
					}
					return;
				}

				// 3. Skip tags not in the general ALLOWED_TAGS list
				if (!ALLOWED_TAGS.has(name)) {
					// Tag is not allowed, skip outputting it. Content will be processed by ontext.
					return;
				}

				// --- Tag Output Logic (if not skipped) ---

				sanitizedHtml += `<${name}`;

				// Keep only allowed attributes for this tag
				const allowedAttrs = ALLOWED_ATTRIBUTES[name];
				if (allowedAttrs) {
					for (const attrName in attribs) {
						if (allowedAttrs.has(attrName)) {
							const value = attribs[attrName];
							if (value !== undefined && value !== null) {
								sanitizedHtml += ` ${attrName}="${escapeAttribute(attrName, value)}"`;
							} else if (attrName === 'alt') {
								sanitizedHtml += ` alt=""`;
							}
						}
					}
				}
				sanitizedHtml += '>';

				// --- Update Nesting Level ---
				// Increment level AFTER processing the opening tag, specifically for td/th
				if (name === 'td' || name === 'th') {
					insideTableCellLevel++;
				}
			},

			ontext(text) {
				// Only add text if we are not skipping content (e.g. inside <script>)
				// Text inside skipped *nested tables* IS processed here, which is intended.
				if (skipContentLevel === 0) {
					sanitizedHtml += escapeHtml(text);
				}
			},

			onclosetag(name) {
				// --- Handle Exiting Skipped Content Tags ---
				if (TAGS_TO_SKIP_CONTENT.has(name)) {
					if (skipContentLevel > 0) {
						skipContentLevel--;
					}
					return; // Don't output the closing tag for skipped content tags
				}
				if (skipContentLevel > 0) {
					return; // Still inside skipped content like <script>
				}

				// --- Update Nesting Level ---
				// Store the level *before* potentially decrementing for td/th closure
				const levelBeforeDecrement = insideTableCellLevel;
				// Decrement level *before* deciding whether to output the closing tag
				if (name === 'td' || name === 'th') {
					if (insideTableCellLevel > 0) {
						insideTableCellLevel--;
					}
				}

				// --- Closing Tag Skipping/Output Logic ---

				// 1. Skip table-related tags if they were part of a nested table
				const isTableTag = TABLE_TAGS.has(name);
				if (isTableTag && levelBeforeDecrement > 0) {
					// This closing tag corresponds to a nested table structure that was skipped on open.
					// Do not output the closing tag.
					return;
				}

				// 2. Skip tags not in ALLOWED_TAGS or if they are VOID tags (which don't have closing tags)
				if (!ALLOWED_TAGS.has(name) || VOID_TAGS.has(name)) {
					return;
				}

				// 3. Output the closing tag if it wasn't skipped for nesting or other reasons
				sanitizedHtml += `</${name}>`;
			},

			onend() {
				// Optional: Final cleanup
			},

			onerror(error) {
				baseLogger.error({ error }, 'HTML parsing error');
			},
		},
		{
			decodeEntities: true, // Decode entities like &amp; -> & during parsing
		},
	);

	parser.write(html);
	parser.end();

	return sanitizedHtml.trim();
}
