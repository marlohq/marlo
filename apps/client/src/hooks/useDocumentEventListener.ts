import { useEffect } from 'react';

/** Binds document event listener with cleanup */
export function useDocumentEventListener<K extends keyof DocumentEventMap>(
	type: K,
	listener: (this: Document, ev: DocumentEventMap[K]) => void,
) {
	useEffect(() => {
		document.addEventListener(type, listener);
		return () => {
			document.removeEventListener(type, listener);
		};
	}, [type, listener]);
}
