import { invariant } from 'es-toolkit';
import {
	type Account,
	account as accountTable,
	db,
	type InferInsertModel,
	type SQL,
	space as spaceTable,
	type TransactionOrDatabase,
} from '../drizzle.ts';
import { logger } from '../logger.ts';
import { BUILTIN_SPACES } from '../space.ts';
import { createId } from '../util.ts';

export async function updateAccount({
	tx: txOrDb = db,
	data,
	where,
}: {
	tx?: TransactionOrDatabase;
	data: Partial<InferInsertModel<typeof accountTable>>;
	where: SQL;
}): Promise<Account> {
	const updatedAccounts = await txOrDb.update(accountTable).set(data).where(where).returning();
	const updatedAccount = updatedAccounts[0];
	invariant(updatedAccounts.length <= 1, `Expected a unique update, got ${updatedAccounts.length}`);
	invariant(updatedAccount, 'Failed to update any account');
	logger.debug({ id: updatedAccount.id, updatedFields: Object.keys(data) }, 'updateAccount()');
	return updatedAccount;
}

export async function createAccount({
	tx: txOrDb = db,
	data,
}: {
	tx?: TransactionOrDatabase;
	data: InferInsertModel<typeof accountTable>;
}) {
	const newAccountData = await txOrDb
		.insert(accountTable)
		.values({
			id: createId(),
			...data,
		})
		.returning();
	const newAccount = newAccountData[0];
	invariant(newAccount, 'Failed to create account');
	logger.debug({ id: newAccount.id }, 'createAccount()');
	await addDefaultSpacesToAccount(newAccount.id, txOrDb);
	return newAccount;
}

async function addDefaultSpacesToAccount(accountId: string, txOrDb: TransactionOrDatabase = db) {
	for (const [spaceId, name] of Object.entries(BUILTIN_SPACES)) {
		const id = `${spaceId}_${accountId}`;
		const data = { id, accountId, name };
		await txOrDb.insert(spaceTable).values(data);
		logger.debug(data, 'addDefaultSpacesToAccount()');
	}
}
