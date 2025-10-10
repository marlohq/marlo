import type { Editor } from '@tiptap/react';
import { EditorContent } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/util.ts';

export default function EditorWindow({
	className,
	editor,
	handleFileChange,
}: {
	className?: string;
	editor: Editor;
	files: File[];
	removeFile: (file: File) => void;
	handleFileChange: (file: FileList) => void;
}) {
	const [isOver, setIsOver] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const element = containerRef.current;
		if (!element) return;

		const onDragLeave = (ev: DragEvent) => {
			ev.stopPropagation();
			setIsOver(false);
		};

		const onDragOver = (ev: DragEvent) => {
			setIsOver(true);
			ev.stopPropagation();
			ev.preventDefault();
		};

		const onDrop = (ev: DragEvent) => {
			ev.stopPropagation();
			ev.preventDefault();
			setIsOver(false);
			const files = ev.dataTransfer?.files;
			if (files && files.length > 0) {
				handleFileChange(files);
			}
		};

		element.addEventListener('dragleave', onDragLeave, { capture: true });
		element.addEventListener('drop', onDrop, { capture: true });
		element.addEventListener('dragover', onDragOver, { capture: true });

		return () => {
			element.removeEventListener('dragleave', onDragLeave, { capture: true });
			element.removeEventListener('drop', onDrop, { capture: true });
			element.removeEventListener('dragover', onDragOver, { capture: true });
		};
	}, [handleFileChange]);

	return (
		<div
			className={cn(
				'relative flex h-full flex-col overflow-y-auto border border-transparent',
				isOver && 'border-blue-300 bg-gradient-to-b from-[#D4E4FF33] to-[#B3F0FF33]',
				className,
			)}
			ref={containerRef}
		>
			<EditorContent editor={editor} className="h-full" />
		</div>
	);
}
