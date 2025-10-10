/**
 * Performance debugging utility for local package. Only active when localStorage.debug === 'true'
 * (in browser) or when ROARR_LOG is set (in Node.js)
 */

const perfEnabled = () => {
	// Check if we're in a browser environment
	if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
		return localStorage.debug === 'true';
	}
	// Check if we're in Node.js environment (for tests)
	if (typeof process !== 'undefined' && process.env) {
		return process.env.ROARR_LOG === '1' || process.env.DEBUG === 'true';
	}
	return false;
};

interface PerfTimer {
	start: number;
	label: string;
}

class PerfDebugger {
	private timers = new Map<string, PerfTimer>();

	time(label: string): void {
		if (!perfEnabled()) return;
		this.timers.set(label, {
			start: performance.now(),
			label,
		});
		// biome-ignore lint/suspicious/noConsole: Debug logging
		console.time(label);
	}

	timeEnd(label: string): number | undefined {
		if (!perfEnabled()) return;
		const timer = this.timers.get(label);
		if (!timer) return;

		const duration = performance.now() - timer.start;
		this.timers.delete(label);
		// biome-ignore lint/suspicious/noConsole: Debug logging
		console.timeEnd(label);
		return duration;
	}

	log(message: string, data?: unknown): void {
		if (!perfEnabled()) return;
		// biome-ignore lint/suspicious/noConsole: Debug logging
		console.log(message, data);
	}

	warn(message: string, data?: unknown): void {
		if (!perfEnabled()) return;
		// biome-ignore lint/suspicious/noConsole: Debug logging
		console.warn(message, data);
	}

	error(message: string, data?: unknown): void {
		if (!perfEnabled()) return;
		// biome-ignore lint/suspicious/noConsole: Debug logging
		console.error(message, data);
	}

	/** Check if performance debugging is enabled */
	isEnabled(): boolean {
		return perfEnabled();
	}
}

export const perf = new PerfDebugger();
