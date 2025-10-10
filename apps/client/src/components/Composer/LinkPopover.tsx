import { RiDeleteBack2Line, RiLink } from '@remixicon/react';
import type { Editor } from '@tiptap/core';
import { Button } from '@workspace/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

// Custom hook to handle link popover functionality
export function useLinkPopover(editor: Editor) {
	const [popoverState, setPopoverState] = useState<{
		isOpen: boolean;
		url: string;
		position: { x: number; y: number };
	}>({
		isOpen: false,
		url: '',
		position: { x: 0, y: 0 },
	});

	const handleLinkClick = useCallback(
		(event: MouseEvent) => {
			const target = event.target as HTMLElement;
			const linkElement = target.closest('a');

			if (!linkElement || !editor) return;

			event.preventDefault();

			// Get the position of the link element
			const rect = linkElement.getBoundingClientRect();
			const url = linkElement.getAttribute('href') || '';

			setPopoverState({
				isOpen: true,
				url,
				position: {
					x: rect.left,
					y: rect.top,
				},
			});
		},
		[editor],
	);

	const closePopover = useCallback(() => {
		setPopoverState((prev) => ({ ...prev, isOpen: false }));
	}, []);

	const removeLink = useCallback(() => {
		if (editor) {
			editor.chain().focus().unsetLink().run();
		}
		closePopover();
	}, [editor, closePopover]);

	// Set up event listeners for links in the editor
	useEffect(() => {
		if (!editor?.view?.dom) return;

		const editorElement = editor.view.dom;
		editorElement.addEventListener('click', handleLinkClick);

		return () => {
			editorElement.removeEventListener('click', handleLinkClick);
		};
	}, [editor, handleLinkClick]);

	return {
		popoverState,
		closePopover,
		removeLink,
	};
}

interface LinkPopoverProps {
	isOpen: boolean;
	url: string;
	onRemoveLink: () => void;
	onClose: () => void;
	position: { x: number; y: number };
}

export function LinkPopover({ isOpen, url, onRemoveLink, onClose, position }: LinkPopoverProps) {
	const popoverRef = useRef<HTMLDivElement>(null);

	// Handle click outside to close popover
	useEffect(() => {
		if (!isOpen) return;

		function handleClickOutside(event: MouseEvent) {
			if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
				onClose();
			}
		}

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [isOpen, onClose]);

	// Handle escape key to close popover
	useEffect(() => {
		if (!isOpen) return;

		function handleEscape(event: KeyboardEvent) {
			if (event.key === 'Escape') {
				onClose();
			}
		}

		document.addEventListener('keydown', handleEscape);
		return () => document.removeEventListener('keydown', handleEscape);
	}, [isOpen, onClose]);

	if (!isOpen) return null;

	return (
		<div
			ref={popoverRef}
			className="fixed z-50 overflow-hidden rounded-md border border-blue-400 bg-white shadow-sm"
			style={{
				left: position.x,
				top: position.y - 48, // Position above the link
				minWidth: '250px',
				maxWidth: '400px',
			}}
		>
			<div className="flex w-full items-center gap-1 px-1.5 py-1">
				{/* URL display and open button */}
				<div className="flex size-6 items-center justify-center rounded-full">
					<RiLink className="size-4 text-blue-600" />
				</div>
				<a
					href={url}
					target="_blank"
					rel="noopener noreferrer"
					className="flex flex-1 justify-start gap-2 truncate text-left text-blue-600 hover:underline"
				>
					<span className="truncate text-sm">{url}</span>
				</a>

				{/* Remove link button */}
				<Button
					variant="ghost"
					size="icon"
					onClick={onRemoveLink}
					className="ml-2 size-7 text-neutral-500 hover:bg-red-50 hover:text-red-600"
					title="Remove link"
				>
					<RiDeleteBack2Line className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
}
