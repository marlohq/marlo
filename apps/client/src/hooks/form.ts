import { zodResolver } from '@hookform/resolvers/zod';
import type { MessageData } from '@workspace/sync-data/data.js';
import { useForm } from 'react-hook-form';
import { type FormSchema, formSchema } from '../components/Composer/util.ts';

export function useComposerForm(draftMessage?: MessageData) {
	const form = useForm<FormSchema>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			draftId: draftMessage?.draftId ?? '',
			to:
				draftMessage?.messageRecipients
					.filter((r) => r.type === 'TO')
					.map((r) => ({ addr: r.email, name: r.name })) ?? [],
			cc:
				draftMessage?.messageRecipients
					.filter((r) => r.type === 'CC')
					.map((r) => ({ addr: r.email, name: r.name })) ?? [],
			bcc:
				draftMessage?.messageRecipients
					.filter((r) => r.type === 'BCC')
					.map((r) => ({ addr: r.email, name: r.name })) ?? [],
			subject: draftMessage?.subject ?? '',
			body: draftMessage?.contentHtml ?? '',
			attachments: [],
		},
		reValidateMode: 'onSubmit',
	});

	return form;
}
