import { RiAttachment2, RiCloseFill } from '@remixicon/react';

export function AddedAttachment({
	file,
	onRemove,
}: {
	file: File;
	onRemove: (file: File) => void;
}) {
	return (
		<div className="flex items-center justify-between space-x-2 rounded border bg-gray-100 p-2 text-sm dark:bg-gray-800">
			<div className="flex items-center space-x-1 overflow-hidden">
				<RiAttachment2 size={16} className="flex-shrink-0 text-gray-600 dark:text-gray-400" />
				<span className="truncate text-gray-800 dark:text-gray-200">{file.name}</span>
			</div>
			<div className="flex flex-shrink-0 items-center space-x-2">
				<button
					type="button"
					className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
					onClick={() => onRemove(file)}
				>
					<RiCloseFill size={16} />
				</button>
			</div>
		</div>
	);
}
