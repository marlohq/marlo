import { useEffect, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { FormSchema } from '../components/Composer/util.ts';

export function useAttachments({ form }: { form: UseFormReturn<FormSchema> }) {
	const [files, setFiles] = useState<File[]>([]);
	const [size, setSize] = useState(0);
	const [init, setInit] = useState(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: this is correct, the array doesn't change
	useEffect(() => {
		// Prevent setting on initial load which cause an early save.
		if (init) {
			form.setValue('attachments', files);
		} else {
			setInit(true);
		}
	}, [files.map((f) => f.name).join('-')]);

	const addFiles = (newFiles: FileList) => {
		const allFiles = Array.from(files);
		for (const file of newFiles) {
			// Append the file if it doesn't already exist
			if (allFiles.find((f) => f.name === file.name)) {
				continue;
			}
			allFiles.push(file);
		}
		setFiles(allFiles);
		setSize(allFiles.reduce((acc, file) => acc + file.size, 0));
	};

	const removeFile = (file: File) => {
		const allFiles = files.filter((f) => f.name !== file.name);
		setFiles(allFiles);
		setSize(allFiles.reduce((acc, f) => acc + f.size, 0));
	};

	return {
		files,
		addFiles,
		size,
		exceedsSizeLimit: size > 25 * 1024 * 1024,
		removeFile,
	};
}
