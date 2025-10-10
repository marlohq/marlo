/// <reference types="vitest" />
import { getViteConfig } from 'astro/config';
import type { TestProjectConfiguration } from 'vitest/config';

export default getViteConfig({
	// @ts-expect-error - "test" is not a valid property in Astro's getViteConfig
	test: {
		maxConcurrency: 1,
		fileParallelism: false,
		setupFiles: '@workspace/test-utils/setup.ts',
		env: {
			DATABASE_URL: 'postgres://magicthing:password@127.0.0.1:5432/magicthing-test',
		},
	} as TestProjectConfiguration,
});
