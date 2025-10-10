import {
	RiAddFill,
	RiCommandFill,
	RiInbox2Line,
	RiPencilFill,
	RiSearchLine,
	RiSettings3Line,
	RiTriangleFill,
} from '@remixicon/react';
import { prependBackendUrl } from '@workspace/core/url.js';
import { useQuery } from '@workspace/local/query.js';
import { Button } from '@workspace/ui';
import { Link, NavLink } from 'react-router';
import { ZapIcon } from '../icons/ZapIcon.tsx';
import { getCustomSpacesQuery } from '../lib/queries.ts';
import { cn } from '../lib/util.ts';
import { useCommandPaletteActions } from './CommandPalette/context.tsx';

function IconLink({
	to,
	label,
	children,
	className,
}: {
	to: string;
	label: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<NavLink
			to={to}
			aria-label={label}
			title={label}
			className={({ isActive }) =>
				cn(
					'relative flex size-9 items-center justify-center rounded-md text-neutral-600 outline outline-1 outline-transparent transition-colors',
					className,
					isActive
						? 'border-neutral-700 bg-black/10 text-neutral-800 [&>div]:opacity-60'
						: 'hover:bg-black/5 hover:text-neutral-800',
				)
			}
		>
			{children}
			<div className="absolute right-[-13px] top-2 z-10 h-5 w-[3px] rounded-l-md bg-black opacity-0 transition-opacity" />
		</NavLink>
	);
}

function IconButton({
	onClick,
	label,
	children,
	className,
}: {
	onClick: () => void;
	label: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			className={cn(
				'flex size-9 items-center justify-center rounded-md text-neutral-600 outline outline-1 outline-transparent transition-colors',
				'hover:bg-black/5 hover:text-neutral-800',
				className,
			)}
			onClick={onClick}
		>
			{children}
		</button>
	);
}

function ActionButton({
	to,
	Icon,
	label,
	className,
}: {
	to: string;
	Icon: React.ElementType;
	label: string;
	className: ({ isActive }: { isActive: boolean }) => string;
}) {
	return (
		<NavLink
			className={({ isActive }) =>
				cn(
					'inline-flex size-9 items-center justify-center rounded-md text-neutral-600 transition-colors',
					className({ isActive }),
				)
			}
			to={to}
			aria-label={label}
		>
			<Icon className="size-5" aria-hidden />
		</NavLink>
	);
}

export function RootLayoutSideNav() {
	const { setOpen } = useCommandPaletteActions();
	const [spaces] = useQuery((db) => getCustomSpacesQuery(db).toArray());

	return (
		<nav aria-label="Primary" className="flex h-full shrink-0 flex-col items-center">
			<div className="flex h-16 w-full flex-col items-center justify-center">
				<img src="/logom.jpg" className="size-8 rounded-md" alt="" />
			</div>
			<div className="flex w-full flex-col items-center gap-1">
				<IconLink to="/" label="Priority">
					<RiInbox2Line className="size-5" aria-hidden />
				</IconLink>
				<IconLink to="/triage" label="Triage">
					<ZapIcon className="size-[18px]" aria-hidden />
				</IconLink>
				<IconLink to="/search" label="Search">
					<RiSearchLine className="size-5" aria-hidden />
				</IconLink>

				{spaces?.slice(0, 3).map((space) => (
					<IconLink key={space.data.id} to={`/spaces/${space.data.id}`} label={space.data.name}>
						<RiTriangleFill className="size-5" aria-hidden />
					</IconLink>
				))}

				<IconButton
					onClick={() => setOpen({ type: 'root' })}
					label="New"
					className="text-neutral-400"
				>
					<RiAddFill className="size-6" aria-hidden />
				</IconButton>
			</div>
			<div className="h-full flex-1" />

			<div className="flex w-full flex-col items-center gap-0.5 py-4">
				<Link to="/compose">
					<Button
						size="icon"
						className="mb-1.5 size-6 bg-blue-600 p-1 text-white hover:bg-blue-700"
						asChild
					>
						<RiPencilFill className="size-4" aria-hidden />
					</Button>
				</Link>
				<IconButton onClick={() => setOpen({ type: 'root' })} label="Command Palette" className="">
					<RiCommandFill className="size-5" aria-hidden />
				</IconButton>
				<IconButton
					onClick={() => setOpen({ type: 'settings' })}
					label="Settings"
					className="mb-1.5"
				>
					<RiSettings3Line className="size-5" aria-hidden />
				</IconButton>

				<SideNavAccounts onAccountClick={() => setOpen({ type: 'account.switch' })} />
			</div>
		</nav>
	);
}

type SideNavAccountsProps = {
	onAccountClick: () => void;
};

function SideNavAccounts({ onAccountClick }: SideNavAccountsProps) {
	const [accountsData] = useQuery((db) => db.accounts.toArray());
	const accounts = accountsData?.map((a) => a.data) ?? [];

	return (
		<>
			{accounts.map((account) => (
				<button
					key={account.id}
					type="button"
					aria-label={`Switch to ${account.email}`}
					title={account.email}
					className={cn(
						'group relative flex size-8 items-center justify-start overflow-hidden rounded-md',
						'outline outline-1 outline-transparent hover:outline-black/10',
					)}
					onClick={onAccountClick}
				>
					<AccountAvatar pictureHash={account.pictureHash} />
					<div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-neutral-900/25 to-neutral-900/15 opacity-0 transition-opacity group-hover:opacity-100" />
				</button>
			))}
		</>
	);
}

function AccountAvatar(props: { pictureHash: string | null | undefined }) {
	if (props.pictureHash == null) {
		return (
			<div className="h-full w-full rounded-md bg-gradient-to-tr from-violet-500 to-sky-400" />
		);
	}
	return (
		<img
			className="h-full w-full rounded-md"
			src={prependBackendUrl(`/user/pictures/${props.pictureHash}`)}
			alt=""
		/>
	);
}
