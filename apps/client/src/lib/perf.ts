/**
 * Performance debugging utility for client-side code. Only active when localStorage.debug ===
 * 'true'
 */

const perfEnabled = () => localStorage.debug === 'true';

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
		console.time(label);
	}

	timeEnd(label: string): number | undefined {
		if (!perfEnabled()) return;
		const timer = this.timers.get(label);
		if (!timer) return;

		const duration = performance.now() - timer.start;
		this.timers.delete(label);
		console.timeEnd(label);
		return duration;
	}

	log(message: string, data?: unknown): void {
		if (!perfEnabled()) return;
		console.log(message, data);
	}

	warn(message: string, data?: unknown): void {
		if (!perfEnabled()) return;
		console.warn(message, data);
	}

	error(message: string, data?: unknown): void {
		if (!perfEnabled()) return;
		console.error(message, data);
	}

	group(label: string): void {
		if (!perfEnabled()) return;
		console.group(label);
	}

	groupEnd(): void {
		if (!perfEnabled()) return;
		console.groupEnd();
	}

	/** Measure an async operation */
	async measure<T>(label: string, operation: () => Promise<T>): Promise<T> {
		if (!perfEnabled()) {
			return operation();
		}

		this.time(label);
		try {
			const result = await operation();
			this.timeEnd(label);
			return result;
		} catch (error) {
			this.timeEnd(label);
			this.error(`${label} failed`, error);
			throw error;
		}
	}

	/** Check if performance debugging is enabled */
	isEnabled(): boolean {
		return perfEnabled();
	}
}

export const perf = new PerfDebugger();
