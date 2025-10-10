import * as Sentry from '@sentry/react';
import { prependBackendUrl } from '@workspace/core/url.js';
import { type RefObject, useCallback, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { parseSrcset, type SrcSetDefinition, stringifySrcset } from 'srcset';

type ShadowRef = RefObject<{
	getContent: () => { html: string; text: string };
} | null>;

// This takes already sanitized HTML and puts it in a shadowRoot.
// This acts like a light-weight iframe. Styles inside don't leak out
// But styles are inherited.
function Shadow({
	ref,
	html,
	className,
	onMount,
}: {
	ref?: ShadowRef;
	html: string;
	className?: string;
	onMount?: (shadow: ShadowRoot) => void;
}) {
	const contRef = useRef<HTMLDivElement>(null);
	useImperativeHandle(ref, () => {
		return {
			getContent() {
				const root = contRef.current?.shadowRoot?.firstElementChild;
				return {
					html: root?.innerHTML ?? '',
					text: root?.textContent ?? '',
				};
			},
		};
	});
	useLayoutEffect(() => {
		const div = contRef.current;
		if (div?.shadowRoot) return;
		const shadow = div?.attachShadow({ mode: 'open' });
		if (shadow) {
			const editableWrapper = document.createElement('div');
			editableWrapper.contentEditable = 'false';
			editableWrapper.innerHTML = html;
			shadow.appendChild(editableWrapper);
			editableWrapper.style.outline = 'none';
			onMount?.(shadow);
		}
	}, [html, onMount]);

	return <div contentEditable={'false'} className={className} ref={contRef}></div>;
}

export function ShadowMail(props: {
	messageId: string;
	ref?: ShadowRef;
	html: string;
	className?: string;
}) {
	const { messageId } = props;
	const onShadowMount = useCallback(
		(shadow: ShadowRoot) => {
			for (const img of shadow.querySelectorAll('img')) {
				const src = img.src;
				if (/^https?:\/\//.test(src)) {
					const url = new URL(prependBackendUrl(`/mail/images`));
					url.searchParams.set('url', src);
					img.src = url.toString();
					img.crossOrigin = 'use-credentials';
				} else if (src.startsWith('cid:')) {
					const contentId = src.slice(4);
					img.src = prependBackendUrl(`/mail/images/${messageId}?cid=${contentId}`);
				}
				const srcset = img.srcset;
				if (srcset) {
					try {
						const outSrcset: SrcSetDefinition[] = [];
						const values = parseSrcset(srcset);
						for (const value of values) {
							if (value.url) {
								const url = new URL(prependBackendUrl(`/mail/images`));
								url.searchParams.set('url', value.url);
								outSrcset.push({
									...value,
									url: url.toString(),
								});
							}
						}
						img.srcset = stringifySrcset(outSrcset);
					} catch (error) {
						Sentry.captureMessage('Failed to parse srcset attribute', {
							level: 'info',
							extra: {
								srcset,
								messageId,
								error,
							},
						});
					}
				}
			}
			for (const anchor of shadow.querySelectorAll('a')) {
				anchor.target = '_blank';
				anchor.rel = 'noopener noreferrer';
			}
		},
		[messageId],
	);

	return <Shadow onMount={onShadowMount} {...props} />;
}
