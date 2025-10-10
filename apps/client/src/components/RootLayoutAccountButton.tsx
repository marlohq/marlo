import { prependBackendUrl } from '@workspace/core/url.ts';
import { useCurrentAccount } from '../hooks/useCurrentAccount.tsx';

export function RootLayoutAccountButton({ onClick }: { onClick: () => void }) {
	const currentAccount = useCurrentAccount();
	return (
		<div className="flex items-center justify-between">
			<button
				type="button"
				className="group relative flex size-8 items-center justify-start self-stretch overflow-hidden rounded-md"
				onClick={onClick}
			>
				<UserAvatar pictureHash={currentAccount.pictureHash} />
				<div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-neutral-900/25 to-neutral-900/15 opacity-0 transition-opacity group-hover:opacity-100"></div>
			</button>
		</div>
	);
}

export function UserAvatar(props: { pictureHash: string | null | undefined }) {
	return (
		<div className="flex items-center justify-center">
			{props.pictureHash == null ? (
				<div className="h-full w-full rounded-md bg-gradient-to-tr from-violet-500 to-sky-400"></div>
			) : (
				<img
					className="h-full w-full rounded-md"
					src={prependBackendUrl(`/user/pictures/${props.pictureHash}`)}
					alt="User avatar"
				></img>
			)}
		</div>
	);
}
