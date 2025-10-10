/**
 * Resolves the given path relative to the PUBLIC_BACKEND_URL (http://localhost:3001,
 * https://marlo.so, etc.). Returns the full URL (href) as a string.
 */
export function prependBackendUrl(path: string): string {
	return new URL(path, import.meta.env.PUBLIC_BACKEND_URL).href;
}
