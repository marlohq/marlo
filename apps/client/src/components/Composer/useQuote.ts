import type { Editor as TiptapEditor } from '@tiptap/core';
import { Editor as CoreEditor } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import StarterKit from '@tiptap/starter-kit';
import type { MessageData } from '@workspace/sync-data/data.ts';
import { useMemo, useState } from 'react';
import { createReplyQuoteHtml } from '../../lib/draft.ts';
import { EmbeddedHTML } from './EmbeddedHTML.ts';

type QuoteMode = 'auto' | 'custom' | 'none';

// NOTE(fks, 2025-08-26): This file was mostly AI-generated to start, since it touches on so many
// esoteric TipTap editor concepts. It has been been cleaned up and likely evolved since then, but
// that context is important to understanding the code in this file.

/**
 * Use this hook to handle quotes in the message composer. Responsible for extracting and managing
 * the quote as part of the message: sometimes it is kept separate from the message body, and other
 * times it has been injected into the message body so that the user can modify or remove it.
 */
export function useQuote(options: { messageData: MessageData; draftContentHtml?: string }) {
	const { messageData, draftContentHtml } = options;

	const { initialMode, expectedQuoteHtml, initialEditorContent, initialFormBody } = useMemo(() => {
		const initialRaw = draftContentHtml ?? '';
		const expectedRaw = createReplyQuoteHtml(messageData);
		const expectedSanitized = sanitizeExpectedQuote(expectedRaw);
		const expectedQuoteHtmlLocal = normalizeWithTiptap(expectedSanitized);
		const savedSanitizedForCompare = sanitizeExpectedQuote(initialRaw);
		const savedNormLocal = normalizeWithTiptap(savedSanitizedForCompare);
		const expectedQuote = extractQuoteOuterHTML(expectedQuoteHtmlLocal);
		const foundQuote = extractQuoteOuterHTML(savedNormLocal);

		const initialModeLocal: QuoteMode =
			expectedQuote && foundQuote
				? expectedQuote === foundQuote
					? 'auto'
					: 'custom'
				: foundQuote
					? 'custom'
					: 'none';

		const initialEditorContentLocal =
			initialModeLocal === 'auto' ? removeQuoteFromNormalizedHtml(savedNormLocal) : savedNormLocal;

		const initialFormBodyLocal =
			initialModeLocal === 'auto'
				? initialEditorContentLocal + expectedQuoteHtmlLocal
				: savedNormLocal;

		return {
			initialMode: initialModeLocal,
			expectedQuoteHtml: expectedQuoteHtmlLocal,
			initialEditorContent: initialEditorContentLocal,
			initialFormBody: initialFormBodyLocal,
		};
	}, [draftContentHtml, messageData]);

	const quoteMode: QuoteMode = initialMode;
	const [quoteChipVisible, setQuoteChipVisible] = useState<boolean>(initialMode === 'auto');

	// Helper that transforms editor HTML into final form body HTML
	const onEditorUpdate = (html: string): string => {
		const hasInEditorQuote = new DOMParser()
			.parseFromString(html, 'text/html')
			.body.querySelector('div.gmail_quote');
		const inEditorQuote = !!hasInEditorQuote;
		if (quoteMode === 'auto') setQuoteChipVisible(!inEditorQuote);
		return quoteMode === 'auto' && !inEditorQuote ? html + expectedQuoteHtml : html;
	};

	const insertQuoteAtEnd = (editor: TiptapEditor | null | undefined) => {
		if (!editor) return;
		const end = editor.state.doc.content.size;
		editor.commands.insertContentAt(end, expectedQuoteHtml);
		setQuoteChipVisible(false);
	};

	return {
		initialEditorContent,
		initialFormBody,
		quoteChipVisible,
		onEditorUpdate,
		insertQuoteAtEnd,
	};
}

function extractQuoteOuterHTML(html: string): string | null {
	const parser = new DOMParser();
	const doc = parser.parseFromString(html ?? '', 'text/html');
	const el = doc.body.querySelector('div.gmail_quote') as HTMLElement | null;
	return el ? el.outerHTML : null;
}

function removeQuoteFromNormalizedHtml(html: string): string {
	const parser = new DOMParser();
	const doc = parser.parseFromString(html ?? '', 'text/html');
	const body = doc.body;
	const found = body.querySelector('div.gmail_quote') as HTMLElement | null;
	if (found) {
		let prev = found.previousSibling;
		while (prev) {
			const prevIsWhitespaceText =
				prev.nodeType === Node.TEXT_NODE && (prev.textContent ?? '').trim() === '';
			const prevIsBr =
				prev.nodeType === Node.ELEMENT_NODE && (prev as Element).tagName.toLowerCase() === 'br';
			if (!prevIsWhitespaceText && !prevIsBr) break;
			const toRemove = prev;
			prev = prev.previousSibling;
			toRemove.parentNode?.removeChild(toRemove);
		}
		found.remove();
	}
	return body.innerHTML;
}

function normalizeWithTiptap(html: string): string {
	const editor = new CoreEditor({
		extensions: [StarterKit.configure({}), TableKit.configure({}), Image, EmbeddedHTML],
		content: html,
		editable: false,
	});
	const out = editor.getHTML();
	editor.destroy();
	return out;
}

function isEmptyParagraph(el: Element): boolean {
	if (el.tagName.toLowerCase() !== 'p') return false;
	const text = el.textContent?.replace(/\u200C/g, '').trim() ?? '';
	if (text.length > 0) return false;
	// Allow <p><br></p> or whitespace-only
	const onlyBrOrWhitespace = Array.from(el.childNodes).every((n) => {
		if (n.nodeType === Node.TEXT_NODE) return (n.textContent ?? '').trim() === '';
		if (n.nodeType === Node.ELEMENT_NODE) return (n as Element).tagName.toLowerCase() === 'br';
		return true;
	});
	return onlyBrOrWhitespace;
}

function sanitizeExpectedQuote(html: string): string {
	const parser = new DOMParser();
	const doc = parser.parseFromString(html ?? '', 'text/html');
	const body = doc.body;
	const outer = body.querySelector('div.gmail_quote') as HTMLElement | null;
	if (!outer) return html;
	// Remove preceding <br> and whitespace siblings before the outer quote div
	let prev = outer.previousSibling;
	while (prev) {
		const prevIsWhitespaceText =
			prev.nodeType === Node.TEXT_NODE && (prev.textContent ?? '').trim() === '';
		const prevIsBr =
			prev.nodeType === Node.ELEMENT_NODE && (prev as Element).tagName.toLowerCase() === 'br';
		if (!prevIsWhitespaceText && !prevIsBr) break;
		const toRemove = prev;
		prev = prev.previousSibling;
		toRemove.parentNode?.removeChild(toRemove);
	}
	// Remove leading empty <p> inside the inner blockquote
	const inner = outer.querySelector('blockquote.gmail_quote') as HTMLElement | null;
	if (inner) {
		let first = inner.firstElementChild as Element | null;
		while (first && isEmptyParagraph(first)) {
			const toRemove = first;
			first = first.nextElementSibling;
			toRemove.remove();
		}
	}
	return body.innerHTML;
}
