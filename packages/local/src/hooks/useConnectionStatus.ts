import { useEffect, useState } from 'react';
import { type ConnectionStatus, connection } from '../connection.ts';

export function useConnectionStatus() {
	const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(connection.status);
	const [lastSynced, setLastSynced] = useState<Date | null>(connection.lastSynced);
	useEffect(() => {
		const handler = () => {
			setConnectionStatus(connection.status);
			if (connection.status === 'synced') {
				setLastSynced(connection.lastSynced);
			}
		};
		connection.addEventListener('status', handler);
		return () => connection.removeEventListener('status', handler);
	}, []);

	return { connectionStatus, lastSynced };
}
