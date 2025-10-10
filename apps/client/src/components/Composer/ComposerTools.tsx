import {
	RiBold,
	RiDoubleQuotesL,
	RiItalic,
	RiListOrdered,
	RiListUnordered,
	RiUnderline,
} from '@remixicon/react';
import type { Editor } from '@tiptap/react';
import { Button } from '@workspace/ui';
import { twMerge } from 'tailwind-merge';

export function ComposerToolbar({
	editor,
	className,
	attachmentButtonPlacement,
}: {
	editor: Editor;
	className?: string;
	attachmentButtonPlacement: 'left' | 'right';
}) {
	const divider = <div className="mx-2 h-6 w-px" aria-hidden="true" />;
	return (
		<section
			aria-label="Message box actions"
			className={twMerge('flex items-center p-1.5', className)}
		>
			<Button
				className="size-8"
				type="button"
				size="icon"
				variant="ghost"
				title="Bold"
				onClick={() => editor.chain().focus().toggleBold().run()}
			>
				<RiBold aria-hidden />
			</Button>
			<Button
				className="size-8"
				type="button"
				size="icon"
				variant="ghost"
				title="Italic"
				onClick={() => editor.chain().focus().toggleItalic().run()}
			>
				<RiItalic aria-hidden />
			</Button>
			<Button
				className="size-8"
				type="button"
				size="icon"
				variant="ghost"
				title="Underline"
				onClick={() => editor.chain().focus().toggleUnderline().run()}
			>
				<RiUnderline aria-hidden />
			</Button>
			{divider}
			<Button
				className="size-8"
				type="button"
				size="icon"
				variant="ghost"
				title="Bullet List"
				onClick={() => editor.chain().focus().toggleBulletList().run()}
			>
				<RiListUnordered aria-hidden />
			</Button>
			<Button
				className="size-8"
				type="button"
				size="icon"
				variant="ghost"
				title="Numbered List"
				onClick={() => editor.chain().focus().toggleOrderedList().run()}
			>
				<RiListOrdered aria-hidden />
			</Button>
			<Button
				className="size-8"
				type="button"
				size="icon"
				variant="ghost"
				title="Quote"
				onClick={() => editor.chain().focus().toggleBlockquote().run()}
			>
				<RiDoubleQuotesL aria-hidden />
			</Button>
		</section>
	);
}
