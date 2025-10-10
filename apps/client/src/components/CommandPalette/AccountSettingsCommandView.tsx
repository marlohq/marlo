import {
	RiAccountBoxFill,
	RiCornerDownLeftLine,
	RiExternalLinkLine,
	RiSettings3Line,
} from '@remixicon/react';
import { useQuery } from '@workspace/local/query.ts';
import { Badge, Command, CommandGroup, CommandList, CommandNoInput } from '@workspace/ui';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { logoutCommand } from '../../commands/commands/logout.ts';
import { useCurrentAccount } from '../../hooks/useCurrentAccount.tsx';
import { UserAvatar } from '../RootLayoutAccountButton.tsx';
import { BasicCommandItem, CustomCommandItem } from './CommandView.tsx';
import { useCommandPaletteActions } from './context.tsx';

export function AccountSettingsCommandView() {
	const [accounts] = useQuery((db) => db.accounts.toArray());
	const { setOpen } = useCommandPaletteActions();
	const currentAccount = useCurrentAccount();
	const logoutAction = logoutCommand.useAction();
	const navigate = useNavigate();

	useEffect(() => {
		(document.querySelector('[cmdk-root]') as HTMLElement)?.focus();
	}, []);

	return (
		<Command>
			<CommandNoInput />
			<div className="border-b bg-neutral-50 px-11 py-10">
				<div className="flex items-center justify-center gap-3 rounded-md bg-white p-3 shadow-md shadow-purple-800/15 outline outline-purple-900/25">
					<div className="size-10 shrink-0 overflow-hidden rounded-lg bg-red-100">
						<UserAvatar pictureHash={currentAccount?.pictureHash} />
					</div>
					<div className="w-full leading-snug text-neutral-700">
						<h3 className="h-5 text-lg font-semibold">{currentAccount.name}</h3>
						<p className="h-5 text-md text-neutral-500">
							{accounts?.length && accounts.length > 1
								? `${accounts.length} connected accounts`
								: currentAccount.email}
						</p>
					</div>
					<div className="flex shrink-0 items-center gap-1.5">
						<Badge variant="secondary" className="bg-purple-100 text-purple-800">
							Founder's Edition
						</Badge>
					</div>
				</div>
			</div>
			<CommandList>
				<CommandGroup heading="Settings">
					<CustomCommandItem
						label="Integrations"
						icon={<RiSettings3Line className="size-full" aria-hidden />}
						run={() => navigate('/settings/integrations')}
						closeOnSelect={true}
						keywords={['integrations', 'oauth', 'mcp']}
					/>
					<CustomCommandItem
						label="Billing (Managed by Stripe)"
						icon={<RiExternalLinkLine className="size-full" aria-hidden />}
						run={() => window.open('/subscription/manage')}
						closeOnSelect={false}
						keywords={['billing']}
					/>
				</CommandGroup>
				<CommandGroup heading="More">
					<CustomCommandItem
						label="Switch account"
						icon={<RiAccountBoxFill className="size-full" aria-hidden />}
						run={() => setOpen({ type: 'account.switch' })}
						closeOnSelect={false}
						keywords={['account']}
					/>
					<BasicCommandItem
						command={logoutCommand}
						action={logoutAction()}
						keywords={['account']}
					/>
				</CommandGroup>
			</CommandList>

			<div className="mt-2 flex h-10 w-full items-center justify-between border-t border-t-neutral-100 bg-neutral-50 px-3">
				<div className="flex h-6 w-fit max-w-44 items-center gap-1.5"></div>

				<div className="flex items-center gap-4">
					<div className="flex items-center gap-1.5">
						<span className="text-sm text-neutral-600">Cancel</span>
						<div className="flex h-6 w-fit items-center justify-center rounded-md bg-neutral-200 px-1.5">
							<span className="text-xs text-neutral-600">Esc</span>
						</div>
					</div>
					<div className="flex items-center gap-1.5">
						<span className="text-sm text-neutral-600">Confirm</span>
						<div className="flex size-6 min-w-6 items-center justify-center rounded-md bg-neutral-200">
							<RiCornerDownLeftLine className="size-3 text-neutral-600" aria-hidden />
						</div>
					</div>
				</div>
			</div>
		</Command>
	);
}
