import { RiAttachment2, RiDeleteBinFill, RiSendPlaneFill } from '@remixicon/react';
import { Button } from '@workspace/ui';
import { formatDistanceToNow } from 'date-fns';
import { type ComponentProps, useCallback, useEffect, useState } from 'react';
import type { EnhanceState } from '../../hooks/enhance.ts';
import { AIGenerateTextIcon } from '../../icons/AIGenerateText.tsx';
import { LoadingSpinner } from '../LoadingSpinner.tsx';

function lastSavedTime(lastSaved: Date | undefined) {
	return lastSaved ? formatDistanceToNow(lastSaved, { addSuffix: true }) : false;
}

export function ComposerFooter({
	pending,
	sendDisabled,
	enhanceState,
	enhanceDisabled,
	onEnhance,
	onDelete,
	handleFileChange,
	lastSaved,
	exceedsSizeLimit,
	saving,
}: ComponentProps<'div'> & {
	pending?: boolean;
	sendDisabled?: boolean;
	enhanceState: EnhanceState;
	enhanceDisabled: boolean;
	lastSaved: Date | undefined;
	exceedsSizeLimit: boolean;
	saving: boolean;
	onEnhance?: () => void;
	onDelete?: () => void;
	handleFileChange: (files: FileList) => void;
}) {
	const onAttachmentClick = useCallback(() => {
		const input = document.createElement('input');
		input.type = 'file';
		input.click();
		input.onchange = (e) => {
			const files = (e.target as HTMLInputElement).files;
			if (files) {
				handleFileChange(files);
			}
		};
	}, [handleFileChange]);

	return (
		<div className={'order-3 flex h-10 shrink-0 items-center border-t px-1.5'}>
			<Button
				type="button"
				size="icon"
				variant="ghost"
				className="size-8"
				onClick={onAttachmentClick}
			>
				<RiAttachment2 className="text-neutral-600" aria-hidden />
			</Button>
			<Button type="button" variant="ghost" size="icon" className="size-8" onClick={onDelete}>
				<RiDeleteBinFill className="size-4" />
			</Button>
			<ComposerStatusMessage
				lastSaved={lastSaved}
				exceedsSizeLimit={exceedsSizeLimit}
				saving={saving}
			/>
			<div className="w-full flex-1" />
			<Button
				className="ml-2 flex h-8 items-center gap-2 px-3"
				type="button"
				variant="ghost"
				title="Link"
				onClick={onEnhance}
				disabled={enhanceDisabled}
			>
				<AIGenerateTextIcon
					className={
						enhanceState === 'enhancing'
							? 'size-6 bg-gradient-to-r from-[#FF0F7B] to-[#F89B29] bg-clip-text text-transparent'
							: 'size-6'
					}
					aria-hidden
				/>
				<span
					className={
						enhanceState === 'enhancing'
							? 'bg-gradient-to-r from-[#FF0F7B] to-[#F89B29] bg-clip-text text-transparent'
							: ''
					}
				>
					{enhanceState === 'idle' ? 'Enhance' : 'Composing draft'}
				</span>
			</Button>
			<Button
				variant="ghost"
				type="submit"
				className="ml-auto h-8 px-3 text-blue-500 hover:bg-blue-100 hover:text-blue-500"
				disabled={sendDisabled}
			>
				{pending ? (
					<LoadingSpinner className="size-4" aria-hidden />
				) : (
					<RiSendPlaneFill className="size-4" aria-hidden />
				)}
				{'Send'}
			</Button>
		</div>
	);
}

function ComposerStatusMessage({
	lastSaved,
	exceedsSizeLimit,
	saving,
}: {
	lastSaved: Date | undefined;
	exceedsSizeLimit: boolean;
	saving: boolean;
}) {
	const [lastSavedAt, setLastSavedAt] = useState(lastSavedTime(lastSaved));

	useEffect(() => {
		const intervalId = setInterval(() => {
			setLastSavedAt(lastSavedTime(lastSaved));
		}, 1000 * 60); // 1 minute
		setLastSavedAt(lastSavedTime(lastSaved));
		return () => clearInterval(intervalId);
	}, [lastSaved]);

	return (
		<div className="relative flex h-10 items-center justify-start gap-1 pl-2">
			{saving ? (
				<div className="flex h-8 items-center gap-1 text-sm text-neutral-500">
					<LoadingSpinner className="size-4" aria-hidden />
					<span>Saving...</span>
				</div>
			) : lastSavedAt ? (
				<div className="flex h-8 items-center gap-1 text-sm text-neutral-500">
					<span>Draft saved {lastSavedAt}.</span>
				</div>
			) : null}
			{exceedsSizeLimit ? (
				<div className="flex h-8 items-center gap-1 text-sm text-red-500">
					<span>Exceeds 25MB size limit.</span>
				</div>
			) : null}
		</div>
	);
}
