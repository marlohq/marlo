import type { Editor } from '@tiptap/react';
import type { UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';
import { useAttachments } from '../../hooks/attachments.ts';
import { useEnhance } from '../../hooks/enhance.ts';
import { AddedAttachment } from './AddedAttachment.tsx';
import { ComposerFooter } from './Composer.tsx';
import { ComposerToolbar } from './ComposerTools.tsx';
import EditorWindow from './EditorWindow.tsx';
import { RecipientFields } from './RecipientFields.tsx';
import type { formSchema } from './util.ts';

export function StandaloneComposer({
	form,
	editor,
	onSubmit,
	onDelete,
	lastSaved,
	saving,
	pending,
	draftMessageId,
}: {
	form: UseFormReturn<z.infer<typeof formSchema>>;
	editor: Editor;
	onSubmit: (data: z.infer<typeof formSchema>) => void;
	onDelete: () => void;
	lastSaved: Date | undefined;
	pending: boolean;
	saving: boolean;
	draftMessageId: string;
}) {
	const { files, addFiles, removeFile, exceedsSizeLimit } = useAttachments({ form });
	const { enhance, enhancingEnabled, state: enhanceState } = useEnhance({ draftMessageId, editor });

	return (
		<form
			className={'flex h-full w-full flex-col bg-white text-start'}
			onSubmit={form.handleSubmit(onSubmit)}
		>
			<div className="border-b border-neutral-200">
				<RecipientFields form={form} />
			</div>

			<EditorWindow
				editor={editor}
				files={files}
				removeFile={removeFile}
				handleFileChange={addFiles}
				className="order-2 h-full"
			/>
			<div className="order-1 border-b border-neutral-200">
				<ComposerToolbar editor={editor} className="flex-1" attachmentButtonPlacement="left" />
			</div>
			{files.length > 0 && (
				<div
					className={`order-3 space-y-2 px-2 py-2 ${files.length > 4 ? 'max-h-48 overflow-y-auto' : ''}`}
				>
					{files.map((file) => (
						<AddedAttachment key={file.name} file={file} onRemove={removeFile} />
					))}
				</div>
			)}
			<ComposerFooter
				pending={pending}
				sendDisabled={exceedsSizeLimit}
				onEnhance={enhance}
				enhanceDisabled={!enhancingEnabled}
				enhanceState={enhanceState}
				handleFileChange={addFiles}
				lastSaved={lastSaved}
				saving={saving}
				exceedsSizeLimit={exceedsSizeLimit}
				onDelete={onDelete}
			>
				<div className="flex-1" />
			</ComposerFooter>
		</form>
	);
}
