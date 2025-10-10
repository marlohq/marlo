// Safari :(
const whenIdle = window.requestIdleCallback ?? ((cb) => setTimeout(cb, 0));

// Calls a function either when the main thread is idle, or when the caller needs it.
// Based on https://philipwalton.com/articles/idle-until-urgent/
export function idleUntilUrgent<T>(cb: () => Promise<T>): () => Promise<T> {
	let value: Promise<T> | undefined;

	whenIdle(() => {
		value = cb();
	});

	return () => {
		if (value) {
			return value;
		}
		value = cb();
		return value;
	};
}
