import { afterAll, vi } from 'vitest';

export class MockWebSocket extends EventTarget implements WebSocket {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSING = 2;
	static readonly CLOSED = 3;
	private static connectionAttempts: number = 0;

	readonly CONNECTING = 0;
	readonly OPEN = 1;
	readonly CLOSING = 2;
	readonly CLOSED = 3;

	url: string;
	binaryType: BinaryType = 'blob';
	bufferedAmount: number = 0;
	extensions: string = '';
	protocol: string = '';
	readyState: number = this.CONNECTING;
	onclose: ((this: WebSocket, _ev: CloseEvent) => void) | null = null;
	onerror: ((this: WebSocket, _ev: Event) => void) | null = null;
	onmessage: ((this: WebSocket, _ev: MessageEvent) => void) | null = null;
	onopen: ((this: WebSocket, _ev: Event) => void) | null = null;

	constructor(url: string | URL, protocols?: string | string[] | undefined) {
		super();
		this.url = url.toString();

		// Handle protocols for custom auth like the sync engine
		if (protocols) {
			const protocolArray = Array.isArray(protocols) ? protocols : [protocols];

			// Check if marlo-auth or marlo-ping protocol is present
			// marlo-auth is for authenticated connections, marlo-ping is for ping tests
			if (!protocolArray.includes('marlo-auth') && !protocolArray.includes('marlo-ping')) {
				setTimeout(() => {
					this.readyState = this.CLOSED;
					const closeEvent = Object.assign(new Event('close'), {
						code: 1002,
						reason: 'marlo-auth or marlo-ping protocol required',
						wasClean: false,
					});
					this.dispatchEvent(closeEvent);
				}, 10);
				return;
			}

			// For marlo-ping protocol, just open the connection without JWT validation
			if (protocolArray.includes('marlo-ping')) {
				this.protocol = 'marlo-ping';
				setTimeout(() => {
					this.readyState = this.OPEN;
					this.dispatchEvent(new Event('open'));
				}, 10);
				return;
			}

			// For marlo-auth protocol, validate JWT
			if (protocolArray.includes('marlo-auth')) {
				// Extract JWT from second protocol (if present)
				const jwt = protocolArray[1];
				if (!jwt) {
					setTimeout(() => {
						this.readyState = this.CLOSED;
						const closeEvent = Object.assign(new Event('close'), {
							code: 1002,
							reason: 'JWT required in subprotocol',
							wasClean: false,
						});
						this.dispatchEvent(closeEvent);
					}, 10);
					return;
				}

				// For testing, we'll accept any JWT that looks like a JWT (has 3 parts)
				// In a real implementation, this would verify the JWT
				const jwtParts = jwt.split('.');
				if (jwtParts.length !== 3) {
					setTimeout(() => {
						this.readyState = this.CLOSED;
						const closeEvent = Object.assign(new Event('close'), {
							code: 1008,
							reason: 'Invalid JWT',
							wasClean: false,
						});
						this.dispatchEvent(closeEvent);
					}, 10);
					return;
				}

				// Set the protocol to the first one (marlo-auth)
				this.protocol = 'marlo-auth';
			}
		}

		// Simulate successful connection
		setTimeout(() => {
			this.readyState = this.OPEN;
			this.dispatchEvent(new Event('open'));
		}, 10);
	}

	close(_code?: number, _reason?: string): void {
		// Don't actually close the connection in the mock - let it stay open for testing
	}

	send(_data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
		// Parse the message and respond appropriately
		try {
			const message = JSON.parse(_data.toString());

			// Respond to pull messages with empty sync data
			if (message.type === 'pull') {
				MockWebSocket.connectionAttempts++;
				setTimeout(() => {
					// Send threads response
					const threadsResponse = {
						type: 'threads',
						updated: [],
						deleted: [],
						version: '2024-01-01T00:00:00.000Z',
					};
					const messageEvent = Object.assign(new Event('message'), {
						data: JSON.stringify(threadsResponse),
					});
					this.dispatchEvent(messageEvent);

					// Only send synced message for the first connection attempt
					// For reconnections, keep the status as 'syncing'
					if (MockWebSocket.connectionAttempts === 1) {
						setTimeout(() => {
							const syncedResponse = {
								type: 'synced',
							};
							const syncedEvent = Object.assign(new Event('message'), {
								data: JSON.stringify(syncedResponse),
							});
							this.dispatchEvent(syncedEvent);
						}, 50);
					}
				}, 50);
			}
		} catch (error) {
			// Ignore parsing errors
		}
	}
}

globalThis.WebSocket = MockWebSocket;

const cookieStore =
	'expected_session_state=active; syncjwt=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIwMUpRRkdNVFY2SzVGRDlBNzE5MVQ1WEhTMyIsImVtYWlsIjoibWF0dGhld0BtYXJsby5zbyIsInVzZXJJZCI6IjAxSlFGR01UVlBZNjQ3NVdHOTRWMDI2OEdLIiwiaWF0IjoxNzQzMjU3OTY5LCJleHAiOjE3NDU4NDk5Njl9.3E2FGvQUw_EakiGB462uJgvOBCN_oP40sntXPpAq-DA';
const mockedDocumentCookie = vi
	.spyOn(document, 'cookie', 'get')
	.mockImplementation(() => cookieStore);

afterAll(() => {
	mockedDocumentCookie.mockRestore();
});
