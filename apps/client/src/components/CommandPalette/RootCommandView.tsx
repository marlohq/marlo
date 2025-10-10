import {
	RiAccountBoxFill,
	RiAddCircleFill,
	RiArchiveStackFill,
	RiArrowRightLine,
	RiDiscordFill,
	RiHistoryFill,
	RiInbox2Fill,
	RiMessage2Fill,
	RiQuillPenFill,
	RiSearchLine,
	RiSettings3Fill,
	RiShareFill,
} from '@remixicon/react';
import { isElectron } from '@workspace/core/electron.js';
import { prependBackendUrl } from '@workspace/core/url.js';
import { createId } from '@workspace/core/util.js';
import { mutate } from '@workspace/local/mutate.js';
import { useQuery } from '@workspace/local/query.js';
import { Command, CommandGroup, CommandInput, CommandList } from '@workspace/ui';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { logoutCommand } from '../../commands/commands/logout.ts';
import { toggleNotificationsCommand } from '../../commands/commands/toggleNotifications.ts';
import { useAppConfig } from '../../hooks/useAppConfig.tsx';
import { useCurrentAccount } from '../../hooks/useCurrentAccount.tsx';
import { listCategoryClientModules } from '../../lib/categories.ts';
import { getCustomSpacesQuery } from '../../lib/queries.ts';
import { VIEWS } from '../../lib/util.ts';
import { useChatDrawerActions } from '../ChatDrawer/context.jsx';
import {
	BasicCommandItem,
	CommandViewFooter,
	CustomCommandItem,
	ExternalLinkCommandItem,
	LinkCommandItem,
} from './CommandView.tsx';
import { useCommandPaletteActions } from './context.tsx';

export function RootCommandView() {
	const [search, setSearch] = useState('');
	return (
		<Command>
			<CommandInput
				autoFocus
				placeholder={'Type a command or search...'}
				value={search}
				onValueChange={setSearch}
			/>
			<CommandList>
				<SharedRootCommands />
			</CommandList>
			<CommandViewFooter />
		</Command>
	);
}

export function SharedRootCommands() {
	const { setOpen } = useCommandPaletteActions();
	const logoutAction = logoutCommand.useAction();
	const toggleNotificationsAction = toggleNotificationsCommand.useAction();
	const [spaces] = useQuery((db) => getCustomSpacesQuery(db).toArray());
	const [labels] = useQuery((db) => db.labels.toArray(), []);
	const currentAccount = useCurrentAccount();
	const { open: openChatDrawer } = useChatDrawerActions();
	const navigate = useNavigate();
	const { desktopDownloadsEnabled } = useAppConfig();
	return (
		<>
			<CommandGroup heading="Navigation">
				<LinkCommandItem
					to={`/`}
					keywords={['navigation']}
					icon={<RiInbox2Fill className="size-full" aria-hidden />}
				>
					<span>Priority</span>
				</LinkCommandItem>
				<LinkCommandItem
					to={`/triage`}
					keywords={['navigation']}
					icon={<RiArchiveStackFill className="size-full" aria-hidden />}
				>
					<span>Triage</span>
				</LinkCommandItem>
				<LinkCommandItem
					to={`/search`}
					keywords={['navigation']}
					icon={<RiSearchLine className="size-full" aria-hidden />}
				>
					<span>Search</span>
				</LinkCommandItem>
				<LinkCommandItem
					to={`/compose`}
					keywords={['navigation']}
					icon={<RiQuillPenFill className="size-full" aria-hidden />}
				>
					<span>Compose</span>
				</LinkCommandItem>
				{!isElectron && desktopDownloadsEnabled && (
					<ExternalLinkCommandItem
						href={`/desktop/mac`}
						keywords={['navigation', 'desktop', 'mac']}
					>
						<span>Download Desktop App (Mac only)</span>
					</ExternalLinkCommandItem>
				)}
			</CommandGroup>
			<CommandGroup heading="Spaces">
				{spaces?.map((view) => (
					<LinkCommandItem
						key={view.data.id}
						to={`/spaces/${view.data.id}`}
						keywords={['spaces']}
						icon={<RiArrowRightLine className="size-full" aria-hidden />}
					>
						<span>{view.data.name}</span>
					</LinkCommandItem>
				))}
				<CustomCommandItem
					label="New Space"
					icon={<RiAddCircleFill className="size-full" aria-hidden />}
					run={async () => {
						const id = createId();
						await mutate.spaces.create({
							id,
							accountId: currentAccount.id,
							name: '',
							filters: [],
							properties: [],
							actions: [],
							createdAt: new Date(),
							groupBy: '',
							sortBy: '',
						});
						navigate(`/spaces/${id}`);
					}}
					closeOnSelect={false}
					keywords={['spaces']}
				/>
			</CommandGroup>
			<CommandGroup heading="Categories">
				{listCategoryClientModules().map((category) => (
					<LinkCommandItem
						key={category.id}
						to={`/apps/${category.id}`}
						keywords={['categories']}
						icon={<category.icon className="size-full" aria-hidden />}
					>
						<span>{category.name}</span>
					</LinkCommandItem>
				))}
			</CommandGroup>
			<CommandGroup heading="Views">
				{VIEWS.map((view) => (
					<LinkCommandItem
						key={view.id}
						to={`/search?q=${encodeURIComponent(view.id)}`}
						keywords={['views']}
						icon={<RiArrowRightLine className="size-full" aria-hidden />}
					>
						<span>{view.name}</span>
					</LinkCommandItem>
				))}
			</CommandGroup>
			<CommandGroup heading="Labels">
				{labels?.map((label) => (
					<LinkCommandItem
						key={label.data.id}
						to={`/search?q=${encodeURIComponent(`label:${label.data.name}`)}`}
						keywords={['labels']}
						icon={<RiArrowRightLine className="size-full" aria-hidden />}
					>
						<span>{label.data.name}</span>
					</LinkCommandItem>
				))}
			</CommandGroup>
			<CommandGroup heading="Chat">
				<CustomCommandItem
					label="New Chat"
					icon={<RiMessage2Fill className="size-full" aria-hidden />}
					keywords={['navigation']}
					run={async () => {
						const id = createId();
						const now = new Date().toISOString();
						await mutate.conversations.create({
							id,
							accountId: currentAccount.id,
							threadId: null,
							updatedAt: now,
							createdAt: now,
							title: 'New conversation',
							chatMessages: [],
						});
						openChatDrawer(id);
					}}
					closeOnSelect={true}
				/>
				<CustomCommandItem
					label="Chat History"
					icon={<RiHistoryFill className="size-full" aria-hidden />}
					run={() => setOpen({ type: 'conversation.switch' })}
					closeOnSelect={false}
					keywords={['chat']}
				/>
			</CommandGroup>
			<CommandGroup heading="Account">
				<CustomCommandItem
					label="Switch account"
					icon={<RiAccountBoxFill className="size-full" aria-hidden />}
					run={() => setOpen({ type: 'account.switch' })}
					closeOnSelect={false}
					keywords={['account']}
				/>
				<CustomCommandItem
					label="Add account"
					icon={<RiAddCircleFill className="size-full" aria-hidden />}
					run={() =>
						window.open(
							prependBackendUrl(
								`/auth/google/authorize?stage=login${isElectron ? '&platform=desktop' : ''}`,
							),
							isElectron ? '_blank' : undefined,
						)
					}
					closeOnSelect={false}
					keywords={['account']}
				/>
				<CustomCommandItem
					label="Settings"
					icon={<RiSettings3Fill className="size-full" aria-hidden />}
					run={() => setOpen({ type: 'settings' })}
					closeOnSelect={false}
					keywords={['settings']}
				/>
				<CustomCommandItem
					label="Invite to Marlo..."
					icon={<RiShareFill className="size-full" aria-hidden />}
					run={() => setOpen({ type: 'settings.invite' })}
					closeOnSelect={false}
					keywords={['invite', 'user']}
				/>
				<CustomCommandItem
					label="Join our Discord"
					icon={<RiDiscordFill className="size-full" aria-hidden />}
					run={() => window.open('https://discord.gg/wJFM54Csuc', '_blank', 'noopener,noreferrer')}
					closeOnSelect={true}
					keywords={['community', 'discord', 'support']}
				/>
				<BasicCommandItem
					command={toggleNotificationsCommand}
					action={toggleNotificationsAction()}
					keywords={['notifications', 'settings']}
				/>
				<BasicCommandItem command={logoutCommand} action={logoutAction()} keywords={['account']} />
			</CommandGroup>
		</>
	);
}
