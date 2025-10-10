import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'happy-dom',
		maxConcurrency: 1,
		fileParallelism: false,
		setupFiles: ['@workspace/test-utils/setup-browser.ts', './tests/mocks.ts'],
	},
});
