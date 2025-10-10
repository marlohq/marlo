import { isElectron } from './electron.ts';

/**
 * Gets the correct path for a static asset based on the environment. In Electron, assets are served
 * via the marlo://app protocol. In web, assets are served from the root.
 */
export function getAssetPath(assetPath: string): string {
	// Ensure the path starts with /
	const normalizedPath = assetPath.startsWith('/') ? assetPath : `/${assetPath}`;

	if (isElectron) {
		// In Electron, we need to use the marlo://app protocol
		return `marlo://app${normalizedPath}`;
	}

	// In web, use the normal path
	return normalizedPath;
}
