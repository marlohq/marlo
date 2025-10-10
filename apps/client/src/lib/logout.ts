import { isElectron } from '@workspace/core/electron.ts';
import { actions } from './actions.ts';

export async function deleteAllDatabases() {
	const dbs = await indexedDB.databases();
	for (const db of dbs) {
		if (db.name) {
			indexedDB.deleteDatabase(db.name);
		}
	}
}

export function logoutAndRedirect() {
	// Call an action to delete the user's tokens
	const destroyPromise = isElectron
		? window.electronAPI.clearAuthTokens()
		: actions.auth.destroySession({});
	const dropPromise = deleteAllDatabases();

	Promise.all([destroyPromise, dropPromise]).finally(() => {
		window.location.href = '/';
	});
}
