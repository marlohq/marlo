import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// Since we're using a shared database, tests have to run serially.
		maxConcurrency: 1,
		fileParallelism: false,
		setupFiles: '@workspace/test-utils/setup.ts',
		env: {
			DATABASE_URL: 'postgres://magicthing:password@127.0.0.1:5432/magicthing-test',
			DIRECT_DATABASE_URL: 'postgres://magicthing:password@127.0.0.1:5432/magicthing-test',
			BULLMQ_QUEUE_PREFIX: 'test',
		},
	},
});
