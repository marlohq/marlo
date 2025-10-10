// import { RiCloseLine } from '@remixicon/react';
import { useQuery } from '@workspace/local/query.ts';
import { Button, Checkbox, Dialog, DialogContent, Form } from '@workspace/ui';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { actions } from '../../lib/actions.ts';
import { contactAutocompleteQuery } from '../../lib/queries.ts';
import { INVALID_EMAIL_MESSAGE, validateEmail } from '../../lib/util.ts';
import { GenericAutocomplete } from '../Autocomplete.tsx';
import { LoadingSpinner } from '../LoadingSpinner.tsx';
import { useCommandPaletteActions } from './context.tsx';

type InviteFormValues = { invitees: { email: string; name?: string | null }[] };

export function InviteCommandDialog() {
	const { setOpen } = useCommandPaletteActions();
	const [searchValue, setSearchValue] = useState('');
	const inputRef = useRef<HTMLInputElement | null>(null);
	const listScrollRef = useRef<HTMLDivElement | null>(null);
	const form = useForm<InviteFormValues>({
		defaultValues: { invitees: [] },
		reValidateMode: 'onSubmit',
	});
	const invitees = useWatch({ control: form.control, name: 'invitees' }) ?? [];
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Contacts to show in the autocomplete
	const [autocompleteContacts = []] = useQuery(
		(db) =>
			contactAutocompleteQuery(
				db,
				searchValue,
				invitees.map((i) => i.email),
			),
		[searchValue, invitees],
	);
	// Contacts to show in the recommended list
	// TODO: Add some form of sorting here.
	const [recommendedContacts = []] = useQuery((db) => db.contacts.limit(20).toArray(), []);

	function addInvitee(email: string, name?: string | null) {
		const current = form.getValues('invitees');
		if (!email) return;
		if (current.some((i) => i.email === email)) return;
		form.setValue('invitees', [...current, { email, name: name ?? null }], {
			shouldDirty: true,
			shouldTouch: true,
		});
		// Scroll the list container back to the top so the newly added
		// item is visible within the "Invites" section
		requestAnimationFrame(() => {
			listScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
		});
	}

	function removeInvitee(email: string) {
		const current = form.getValues('invitees');
		form.setValue(
			'invitees',
			current.filter((i) => i.email !== email),
			{
				shouldDirty: true,
				shouldTouch: true,
			},
		);
	}

	const onSubmit = async (values: InviteFormValues) => {
		const minimumDelay = new Promise((resolve) => setTimeout(resolve, 3000));
		try {
			setIsSubmitting(true);
			for (const inv of values.invitees) {
				await actions.user.inviteUser({ email: inv.email });
				// TODO: Handle success/failure with UI
			}
			await minimumDelay;
			setOpen(false);
			toast.success('Invites sent successfully');
		} catch (error) {
			await minimumDelay;
			setIsSubmitting(false);
			toast.error('Failed to send invites');
		}
	};

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	const displaySelected = invitees.filter(
		(invitee) => !recommendedContacts.some((contact) => contact.data.email === invitee.email),
	);
	const displayRecommended = recommendedContacts.filter(
		(contact, i) =>
			!recommendedContacts.slice(i + 1).some((c) => c.data.email === contact.data.email),
	);

	return (
		<Dialog
			open={true}
			onOpenChange={() => {
				setOpen(false);
			}}
		>
			<DialogContent
				hideCloseButton={true}
				className="h-[calc(100vh-120px)] overflow-hidden p-0 shadow-2xl"
				offset="top"
			>
				{isSubmitting ? (
					<div className="flex h-full w-full items-center justify-center gap-1">
						<LoadingSpinner className="size-5 text-neutral-800" />
						<div className="text-neutral-500">Sending referrals...</div>
					</div>
				) : (
					<Form {...form}>
						<form
							onSubmit={form.handleSubmit(onSubmit)}
							className="flex h-full flex-col overflow-hidden"
						>
							<div className="flex shrink-0 flex-col px-6 pt-10">
								<div className="text-2xl font-semibold">Invite to Marlo</div>
								<div className="text-md text-neutral-500">
									Invite someone you know to try Marlo. You have{' '}
									<span className="font-semibold text-neutral-900">100</span> invites left.
								</div>
							</div>

							<div className="shrink-0 px-6 py-8 pb-6">
								<GenericAutocomplete
									items={autocompleteContacts}
									onSelect={(value) => {
										addInvitee(value);
										setSearchValue('');
										inputRef.current?.focus();
									}}
									isSelectOnBlur={true}
									isBlurOnSelect={false}
									autoSelectFirstItem={true}
									ref={inputRef}
									onKeyDown={() => {}}
									getItemValue={(contact) => contact.data.email || ''}
									getItemKey={(contact) => contact.data.id}
									searchValue={searchValue}
									setSearchValue={setSearchValue}
									inputProps={{}}
									placeholder={'Enter name or email'}
									validateInput={(input) => ({
										isValid: validateEmail(input),
										errorMessage: INVALID_EMAIL_MESSAGE,
									})}
									renderItem={(contact) => (
										<div className="flex items-center gap-3 truncate">
											<div className="flex flex-col">
												<span className="truncate">{contact.data.name || contact.data.email}</span>
												<span className="truncate text-xs">{contact.data.email}</span>
											</div>
										</div>
									)}
									className="h-11 w-full px-4 py-2 text-[15px] shadow-md shadow-blue-500/10 focus-visible:ring-blue-600/40"
								/>
							</div>

							<div
								ref={listScrollRef}
								className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-6 pb-4"
							>
								{displaySelected.length > 0 && (
									<>
										<div className="flex h-8 items-center gap-2 pt-1 text-sm leading-none text-neutral-500">
											<span>Invites</span>
										</div>
										<div className="flex flex-col">
											{displaySelected.map((invitee) => (
												<ContactRow
													key={invitee.email}
													email={invitee.email}
													name={invitee.name}
													checked={true}
													onCheckedChange={(checked) => {
														if (checked === false) removeInvitee(invitee.email);
													}}
												/>
											))}
										</div>
									</>
								)}

								<div className="flex h-8 items-center gap-2 pt-1 text-sm leading-none text-neutral-500">
									<span>Recommended</span>
								</div>
								<div className="flex flex-col">
									{displayRecommended.slice(0, 20).map((contact) => (
										<ContactRow
											key={contact.data.id}
											email={contact.data.email}
											name={contact.data.name}
											checked={invitees.some((invitee) => invitee.email === contact.data.email)}
											onCheckedChange={(checked) => {
												if (checked === true) addInvitee(contact.data.email);
												if (checked === false) removeInvitee(contact.data.email);
											}}
										/>
									))}
								</div>
							</div>

							<div className="flex shrink-0 items-center justify-end gap-2 border-t px-6 py-4">
								<Button
									type="submit"
									className="shrink-0 overflow-hidden bg-blue-600 pl-3 pr-2.5 text-white hover:bg-blue-700"
									disabled={invitees.length === 0}
								>
									Send {invitees.length > 1 ? `${invitees.length} Invites` : 'Invites'}
								</Button>
							</div>
						</form>
					</Form>
				)}
			</DialogContent>
		</Dialog>
	);
}

function ContactRow({
	email,
	name,
	checked,
	onCheckedChange,
}: {
	email: string;
	name?: string | null;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
}) {
	return (
		<div className="flex h-9 w-full items-center gap-3 overflow-hidden hover:bg-neutral-50">
			<Checkbox checked={checked} onCheckedChange={onCheckedChange} />
			<div className="min-w-0 flex-1 truncate text-sm">
				<span className="font-medium">{name || email}</span>
				{name && <span className="text-neutral-500"> — {email}</span>}
			</div>
		</div>
	);
}
