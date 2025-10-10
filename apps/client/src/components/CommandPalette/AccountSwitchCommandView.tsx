import { RiAddCircleFill, RiCornerDownLeftLine, RiSettings3Fill } from '@remixicon/react';
import { isElectron } from '@workspace/core/electron.js';
import { prependBackendUrl } from '@workspace/core/url.ts';
import { useQuery } from '@workspace/local/query.ts';
import { Command, CommandGroup, CommandInput, CommandList } from '@workspace/ui';
import { useMemo, useState } from 'react';
import { logoutCommand } from '../../commands/commands/logout.ts';
import { switchAccountCommand } from '../../commands/commands/switchAccount.ts';
import { useCurrentAccount } from '../../hooks/useCurrentAccount.tsx';
import { BasicCommandItem, CustomCommandItem } from './CommandView.tsx';
import { useCommandPaletteActions } from './context.tsx';

export function AccountSwitchCommandView() {
	const [accountsData] = useQuery((db) => db.accounts.toArray());
	const accounts = useMemo(() => accountsData?.map((account) => account.data), [accountsData]);
	const currentAccount = useCurrentAccount();
	const [search, setSearch] = useState('');
	const { setOpen } = useCommandPaletteActions();
	const logoutAction = logoutCommand.useAction();
	const switchAccountAction = switchAccountCommand.useAction();

	return (
		<Command>
			<CommandInput
				value={search}
				onValueChange={setSearch}
				autoFocus
				placeholder="Switch account..."
			/>
			<CommandList>
				<CommandGroup heading="Accounts">
					{(accounts ? accounts : [currentAccount])?.map((account) => (
						<BasicCommandItem
							key={account.id}
							command={switchAccountCommand}
							action={switchAccountAction(account)}
						>
							<img
								src={prependBackendUrl(`/user/pictures/${account.pictureHash}`)}
								className="size-5 rounded-md"
								alt=""
							/>
							<span className="flex-1">{account.email}</span>
						</BasicCommandItem>
					))}
					<CustomCommandItem
						label="Add new..."
						icon={<RiAddCircleFill className="size-4" aria-hidden />}
						run={() => {
							const authUrl = isElectron
								? prependBackendUrl(
										`/auth/google/authorize?stage=login&platform=desktop&prompt=select_account`,
									)
								: prependBackendUrl(`/auth/google/authorize?stage=login&prompt=select_account`);

							if (isElectron) {
								window.open(authUrl, '_blank');
							} else {
								window.location.href = authUrl;
							}
						}}
						closeOnSelect={false}
						keywords={['account']}
					/>
				</CommandGroup>
				<CommandGroup heading="More">
					<CustomCommandItem
						label="Settings"
						icon={<RiSettings3Fill className="size-full" aria-hidden />}
						run={() => setOpen({ type: 'settings' })}
						closeOnSelect={false}
						keywords={['settings']}
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
