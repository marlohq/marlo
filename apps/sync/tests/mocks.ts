import { WebSocket } from 'ws';

export class MockWebSocket extends WebSocket {
	constructor(url: string) {
		super(url);
		this.readyState = WebSocket.OPEN;
	}

	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSING = 2;
	static readonly CLOSED = 3;

	url: string = '';
	binaryType: 'nodebuffer' | 'arraybuffer' | 'fragments' = 'nodebuffer';
	bufferedAmount: number = 0;
	extensions: string = '';
	protocol: string = '';
	readyState: 0 | 1 | 2 | 3 = WebSocket.CONNECTING;
	isPaused: boolean = false;
	onclose: ((...args: any[]) => void) | null = null;
	onerror: ((...args: any[]) => void) | null = null;
	onmessage: ((...args: any[]) => void) | null = null;
	onopen: ((...args: any[]) => void) | null = null;
	onping: ((...args: any[]) => void) | null = null;
	onpong: ((...args: any[]) => void) | null = null;
	onunexpectedResponse: ((...args: any[]) => void) | null = null;
	onupgrade: ((...args: any[]) => void) | null = null;
	send(
		data: any,
		options?:
			| { mask?: boolean; binary?: boolean; compress?: boolean; fin?: boolean }
			| ((err?: Error) => void),
		cb?: (err?: Error) => void,
	): void {}
	terminate(): void {}
	close(code?: number, data?: string | Buffer): void {}
	pause(): void {}
	resume(): void {}
	ping(data?: any, mask?: boolean, cb?: (err: Error) => void): void {}
	pong(data?: any, mask?: boolean, cb?: (err: Error) => void): void {}
	addListener(event: string | symbol, listener: (...args: any[]) => void): this {
		return this;
	}
	on(event: string | symbol, listener: (...args: any[]) => void): this {
		return this;
	}
	once(event: string | symbol, listener: (...args: any[]) => void): this {
		return this;
	}
	removeListener(event: string | symbol, listener: (...args: any[]) => void): this {
		return this;
	}
	off(event: string | symbol, listener: (...args: any[]) => void): this {
		return this;
	}
	removeAllListeners(event?: string | symbol): this {
		return this;
	}
	setMaxListeners(n: number): this {
		return this;
	}
	getMaxListeners(): number {
		return 0;
	}
	listeners(event: string | symbol): Function[] {
		return [];
	}
	rawListeners(event: string | symbol): Function[] {
		return [];
	}
	emit(event: string | symbol, ...args: any[]): boolean {
		return true;
	}
	listenerCount(event: string | symbol): number {
		return 0;
	}
	prependListener(event: string | symbol, listener: (...args: any[]) => void): this {
		return this;
	}
	prependOnceListener(event: string | symbol, listener: (...args: any[]) => void): this {
		return this;
	}
	eventNames(): Array<string | symbol> {
		return [];
	}
}
