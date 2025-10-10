// Define a map of event names to their event types
interface IPCEventMap {
	login: LoginEvent;
	// Add other events here as needed
}

type IPCEventListener<K extends keyof IPCEventMap> = (event: IPCEventMap[K]) => void;

class IPCEventTarget {
	private target: EventTarget;

	constructor() {
		this.target = new EventTarget();
	}

	addEventListener<K extends keyof IPCEventMap>(
		type: K,
		listener: IPCEventListener<K>,
		options?: boolean | AddEventListenerOptions,
	): void {
		this.target.addEventListener(type, listener as EventListener, options);
	}

	dispatchEvent(event: IPCEventMap[keyof IPCEventMap]): boolean {
		return this.target.dispatchEvent(event);
	}

	removeEventListener<K extends keyof IPCEventMap>(
		type: K,
		listener: IPCEventListener<K>,
		options?: boolean | EventListenerOptions,
	): void {
		this.target.removeEventListener(type, listener as EventListener, options);
	}
}

// Specific event types
class LoginEvent extends Event {
	constructor(public data: { session: string | null; refresh: string | null }) {
		super('login');
	}
}

export const ipcEvents = new IPCEventTarget();

window.electronAPI.onLogin((opts: { session: string | null; refresh: string | null }) => {
	const event = new LoginEvent(opts);
	ipcEvents.dispatchEvent(event);
});
