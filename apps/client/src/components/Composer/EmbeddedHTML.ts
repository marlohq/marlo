import { Extension, Mark, Node } from '@tiptap/core';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';

/**
 * EmbeddedHTML: minimal TipTap extensions to faithfully round‑trip email HTML.
 *
 * - TipTap StarterKit doesn’t support every HTML element we want to preserve from emails.
 * - We often ingest HTML that uses <div>, <span>, and <small>, and that carries inline styles and
 *   classes. Without schema support and attribute passthrough, TipTap will drop or normalize those
 *   details away.
 */
export const EmbeddedHTML = Extension.create({
	name: 'embeddedHTML',

	addExtensions() {
		return [GlobalAttributes, Span, Div, Small, Superscript, Subscript];
	},
});

/**
 * GlobalAttributes Adds a standard set of HTML attributes (style, class, width, height) to a broad
 * list of nodes/marks so that imported email HTML keeps those values when parsed and re‑serialized
 * by TipTap.
 *
 * Note: It’s okay to list types that aren’t enabled in the current editor configuration. TipTap
 * will ignore unknown types; for known ones, the attributes will be preserved.
 */
const GlobalAttributes = Extension.create({
	name: 'globalAttributes',

	addGlobalAttributes() {
		return [
			{
				types: [
					'div',
					'span',
					'heading',
					'paragraph',
					'image',
					'link',
					// Using built‑in italic/bold marks from StarterKit in most places,
					// but these attributes are harmless if those marks are present.
					'italic',
					'small',
					'hardBreak',
					'blockquote',
					'listItem',
					'bulletList',
					'orderedList',
					'table',
					'tableRow',
					'tableHeader',
					'tableCell',
				],
				attributes: {
					style: {
						default: null,
						parseHTML: (element) => element.getAttribute('style'),
						renderHTML: (attributes) => (attributes.style ? { style: attributes.style } : {}),
					},
					class: {
						default: null,
						parseHTML: (element) => element.getAttribute('class'),
						renderHTML: (attributes) => (attributes.class ? { class: attributes.class } : {}),
					},
					width: {
						default: null,
						parseHTML: (element) => element.getAttribute('width'),
						renderHTML: (attributes) => (attributes.width ? { width: attributes.width } : {}),
					},
					height: {
						default: null,
						parseHTML: (element) => element.getAttribute('height'),
						renderHTML: (attributes) => (attributes.height ? { height: attributes.height } : {}),
					},
				},
			},
		];
	},
});

/**
 * Span mark Enables parsing/serializing raw <span> wrappers so we can preserve inline
 * styles/classes coming from email HTML.
 */
const Span = Mark.create({
	name: 'span',

	parseHTML() {
		return [{ tag: 'span' }];
	},

	renderHTML({ HTMLAttributes }) {
		return ['span', HTMLAttributes, 0];
	},
});

/**
 * Div node StarterKit doesn’t include a generic <div> block. Many emails use nested divs; this node
 * preserves those wrappers.
 */
const Div = Node.create({
	name: 'div',
	group: 'block',
	content: 'block*',
	defining: true,

	parseHTML() {
		return [
			{
				tag: 'div',
			},
		];
	},

	renderHTML({ HTMLAttributes }) {
		return ['div', HTMLAttributes, 0];
	},
});

/**
 * Small mark TipTap doesn’t ship a <small> mark. This adds minimal support so <small> from inbound
 * HTML isn’t lost.
 */
const Small = Mark.create({
	name: 'small',
	parseHTML() {
		return [{ tag: 'small' }];
	},
	renderHTML({ HTMLAttributes }) {
		return ['small', HTMLAttributes, 0];
	},
});
