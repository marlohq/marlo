import {
	RiCheckboxCircleFill,
	RiCloseCircleFill,
	RiErrorWarningFill,
	RiInformationFill,
} from '@remixicon/react';
import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

// TODO: When its time to add your first toast with an undo or action button,
// you'll want to follow this API. Consider creating a helper:
//
// toast.info('Title', {
// 	description: 'This is an optional description',
// 	action: (
// 		<button
// 			type="button"
// 			className="text-neutral-500 hover:text-neutral-800"
// 			onClick={() => console.log('Action!')}
// 		>
// 			Undo
// 		</button>
// 	),
// });

const Toaster = ({ ...props }: ToasterProps) => {
	return (
		<Sonner
			theme={'light'}
			className="toaster group"
			visibleToasts={4}
			icons={{
				success: <RiCheckboxCircleFill className="size-5 text-green-600" aria-hidden />,
				info: <RiInformationFill className="size-5 text-blue-600" aria-hidden />,
				warning: <RiErrorWarningFill className="size-5 text-orange-600" aria-hidden />,
				error: <RiCloseCircleFill className="size-5 text-red-600" aria-hidden />,
			}}
			toastOptions={{
				classNames: {
					icon: 'size-5 ml-0 mr-0',
					toast:
						'py-2.5 pl-3 pr-3.5 rounded-lg items-center gap-2 border border-none bg-white shadow-toast',
					content: 'flex-1',
					title: 'text-neutral-800 text-base font-medium leading-5',
					actionButton:
						'text-base font-medium leading-5 text-neutral-600 hover:text-neutral-900 bg-transparent hover:bg-neutral-200/50 rounded-md',
					cancelButton:
						'group-[.toast]:bg-neutral-100 group-[.toast]:text-neutral-500 dark:group-[.toast]:bg-neutral-800 dark:group-[.toast]:text-neutral-400',
				},
			}}
			{...props}
		/>
	);
};

export { Toaster };
