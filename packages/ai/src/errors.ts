import { APICallError, RetryError } from 'ai';

export { APICallError } from 'ai';

export function isRateLimitError(error: unknown): boolean {
	if (RetryError.isInstance(error)) {
		if (APICallError.isInstance(error.lastError) && error.lastError.statusCode === 429) {
			return true;
		}
	}

	if (APICallError.isInstance(error) && error.statusCode === 429) {
		return true;
	}

	return false;
}
