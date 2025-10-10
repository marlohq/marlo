/**
 * Custom error for Google rate limit handling, so that callers can react appropriately to a call
 * being rate limited since the GaxiosError type is not very useful.
 */
export class GoogleRateLimitError extends Error {
	constructor(
		message: string,
		public readonly accountId: string,
		public readonly userId: string,
	) {
		super(message);
		this.name = 'GoogleRateLimitError';
	}
}
