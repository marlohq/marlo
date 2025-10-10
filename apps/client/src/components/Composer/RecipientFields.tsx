import { RiCloseLine } from '@remixicon/react';
import { useQuery } from '@workspace/local/query.ts';
import { Avatar, AvatarFallback, getAvatarInitialsFallback, Input, Label } from '@workspace/ui';
import { useEffect, useId, useRef, useState } from 'react';
import type { ControllerRenderProps } from 'react-hook-form';
import { Controller, type UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';
import { contactAutocompleteQuery } from '../../lib/queries.ts';
import { cn, INVALID_EMAIL_MESSAGE, parseRecipientInput } from '../../lib/util.ts';
import { GenericAutocomplete } from '../Autocomplete.tsx';
import type { formSchema } from './util.ts';

export function RecipientFields({ form }: { form: UseFormReturn<z.infer<typeof formSchema>> }) {
	return (
		<div className="flex flex-1 flex-col py-2">
			<Controller
				control={form.control}
				name="to"
				render={({ field }) => (
					<RecipientField field={field} label="To" placeholder="Empty" autoFocus />
				)}
			/>
			<Controller
				control={form.control}
				name="cc"
				render={({ field }) => <RecipientField field={field} label="Cc" placeholder="Empty" />}
			/>
			<Controller
				control={form.control}
				name="bcc"
				render={({ field }) => <RecipientField field={field} label="Bcc" placeholder="Empty" />}
			/>
			<Controller
				control={form.control}
				name="subject"
				render={({ field }) => <SubjectField field={field} label="Subject" placeholder="Empty" />}
			/>
		</div>
	);
}

function RecipientField({
	label,
	field,
	placeholder,
	autoFocus,
}: {
	label: string;
	field: ControllerRenderProps<z.infer<typeof formSchema>, 'to' | 'cc' | 'bcc'>;
	placeholder: string;
	autoFocus?: boolean;
}) {
	const id = useId();
	const containerRef = useRef<HTMLDivElement | null>(null);

	function shiftFocus(target: HTMLElement, direction: 'left' | 'right') {
		const addressElements = getAddressFieldElements(containerRef.current);
		const indexOfTarget = addressElements.indexOf(target);
		const indexOfFocusShift = Math.max(
			0,
			Math.min(indexOfTarget + (direction === 'left' ? -1 : 1), addressElements.length - 1),
		);
		addressElements[indexOfFocusShift]?.focus();
	}

	return (
		<div className="flex h-8 items-center justify-start gap-2 pl-4 pr-2">
			<Label className="w-20 shrink-0 text-neutral-600" htmlFor={id}>
				{label}
			</Label>
			<div
				className={cn(
					'flex flex-1 flex-wrap items-center gap-2',
					field.value.length > 0 && '-ml-1.5',
				)}
				ref={containerRef}
			>
				{field.value.map((recipient) => (
					<div
						key={recipient.addr}
						className="flex h-7 items-center rounded-full bg-neutral-100 pl-3 pr-1 transition-colors focus-within:bg-blue-50 focus-within:ring-2 focus-within:ring-blue-500 hover:bg-neutral-200 focus-within:hover:bg-blue-100"
					>
						<button
							data-address-field
							type="button"
							className="peer flex cursor-auto items-center gap-1 leading-none text-neutral-800 focus-within:outline-none focus-within:ring-0"
							onCopy={(e) => {
								if (!e.clipboardData) {
									return;
								}
								const textToCopy = recipient.name
									? `${recipient.name} <${recipient.addr}>`
									: recipient.addr;
								e.clipboardData.setData('text/plain', textToCopy);
								e.preventDefault();
							}}
							onKeyDown={(e) => {
								if (e.key === 'Backspace') {
									field.onChange(field.value.filter((a) => a.addr !== recipient.addr));
									const addressElements = getAddressFieldElements(containerRef.current);
									const indexOfTarget = addressElements.indexOf(e.currentTarget);
									queueMicrotask(() => {
										const addressElements = getAddressFieldElements(containerRef.current);
										addressElements[indexOfTarget]?.focus();
									});
								}
								if (e.key === 'ArrowLeft') {
									shiftFocus(e.currentTarget, 'left');
								}
								if (e.key === 'ArrowRight') {
									shiftFocus(e.currentTarget, 'right');
								}
							}}
						>
							<span className="leading-none">{recipient.name ?? recipient.addr}</span>
						</button>
						<button
							type="button"
							className="cursor-auto p-1 text-neutral-400 peer-focus:text-blue-700"
							onClick={() => field.onChange(field.value.filter((a) => a.addr !== recipient.addr))}
						>
							<RiCloseLine aria-hidden className="size-4" />
						</button>
					</div>
				))}
				<RecipientFieldAutocomplete
					field={field}
					onShiftFocus={shiftFocus}
					placeholder={placeholder}
					autoFocus={autoFocus}
				/>
			</div>
		</div>
	);
}

function SubjectField({
	label,
	field,
	placeholder,
}: {
	label: string;
	field: ControllerRenderProps<z.infer<typeof formSchema>, 'subject'>;
	placeholder: string;
}) {
	const id = useId();

	return (
		<div className="flex h-8 items-center justify-start gap-2 pl-4 pr-2">
			<Label className="w-20 shrink-0 text-neutral-600" htmlFor={id}>
				{label}
			</Label>
			<Input
				{...field}
				placeholder={placeholder}
				className="h-[30px] flex-1 border-none p-0 outline-none placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-0"
				style={{ flexBasis: '20px' }}
			/>
		</div>
	);
}

function getAddressFieldElements(container: HTMLDivElement | null): HTMLElement[] {
	if (!container) return [];
	const addressElements = Array.from(container.querySelectorAll('[data-address-field]'));
	return addressElements.filter((element) => element instanceof HTMLElement);
}

function RecipientFieldAutocomplete({
	field,
	onShiftFocus,
	placeholder,
	autoFocus,
}: {
	field: ControllerRenderProps<z.infer<typeof formSchema>, 'to' | 'cc' | 'bcc'>;
	onShiftFocus: (target: HTMLElement, direction: 'left' | 'right') => void;
	placeholder: string;
	autoFocus?: boolean;
}) {
	const [searchValue, setSearchValue] = useState('');
	const [baseContacts] = useQuery(
		(db) =>
			contactAutocompleteQuery(
				db,
				searchValue,
				field.value.map((r) => r.addr),
			),
		[searchValue, field.value],
	);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const contacts = baseContacts ?? [];
	useEffect(() => {
		field.ref(inputRef.current);
	}, [field.ref]);

	useEffect(() => {
		if (autoFocus && inputRef.current) {
			inputRef.current.focus();
		}
	}, [autoFocus]);

	return (
		<GenericAutocomplete
			items={contacts}
			className="h-[30px] flex-1 border-none p-0 outline-none placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-0"
			onSelect={(value) => {
				const parsed = parseRecipientInput(value);
				const selected = contacts.find((c) => (c.data.email || '') === value);
				if (parsed?.name) {
					field.onChange([...field.value, { addr: parsed.addr, name: parsed.name }]);
				} else if (selected) {
					field.onChange([...field.value, { addr: value, name: selected?.data.name ?? null }]);
				} else if (parsed) {
					field.onChange([...field.value, { addr: parsed.addr, name: null }]);
				}
				setSearchValue('');
			}}
			isSelectOnBlur={true}
			isBlurOnSelect={false}
			autoSelectFirstItem={true}
			ref={inputRef}
			onKeyDown={(e) => {
				const isAtStart =
					e.currentTarget.selectionStart === 0 &&
					(e.currentTarget.selectionEnd === null || e.currentTarget.selectionEnd === 0);
				if (e.key === 'Backspace' && isAtStart) {
					e.preventDefault();
					if (inputRef.current) {
						onShiftFocus(inputRef.current, 'left');
					}
				}
				if (e.key === 'ArrowLeft' && isAtStart && inputRef.current) {
					onShiftFocus(inputRef.current, 'left');
				}
			}}
			getItemValue={(contact) => contact.data.email || ''}
			getItemKey={(contact) => contact.data.id}
			searchValue={searchValue}
			setSearchValue={setSearchValue}
			inputProps={{
				onChange: field.onChange,
				onBlur: field.onBlur,
				name: field.name,
				ref: field.ref,
			}}
			placeholder={field.value.length > 0 ? '' : placeholder}
			validateInput={(input) => ({
				isValid: !!parseRecipientInput(input),
				errorMessage: INVALID_EMAIL_MESSAGE,
			})}
			renderItem={(contact) => (
				<div className="flex items-center gap-3 truncate">
					<Avatar className="size-7 shrink-0">
						<AvatarFallback>
							{getAvatarInitialsFallback(contact?.data.name ?? contact?.data.email ?? '')}
						</AvatarFallback>
					</Avatar>
					<div className="flex flex-col">
						<span className="truncate">{contact.data.name ?? contact.data.email}</span>
						<span className="truncate text-xs">{contact.data.email}</span>
					</div>
				</div>
			)}
		/>
	);
}
