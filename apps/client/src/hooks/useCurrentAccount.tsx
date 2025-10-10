import { accountId, useQuery } from '@workspace/local/query.ts';
import type { AccountData } from '@workspace/sync-data/data.js';
import { invariant } from 'es-toolkit';
import { createContext, useContext } from 'react';

const CurrentAccountContext = createContext<{
	account: AccountData | null;
}>({
	account: null,
});

export function CurrentAccountProvider({ children }: { children: React.ReactNode }) {
	const [data] = useQuery((db) => db.accounts.where('data.id').equals(accountId).first());
	if (!data) {
		return null;
	}
	return (
		<CurrentAccountContext.Provider value={{ account: data.data }}>
			{children}
		</CurrentAccountContext.Provider>
	);
}

export function useCurrentAccount() {
	const { account } = useContext(CurrentAccountContext);
	invariant(account, 'Account not found');
	return account;
}
