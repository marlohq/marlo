import config, { type Config } from '@workspace/ui/tailwind.config.ts';

export default {
	// Base our tailwind configuration off of our design system
	...config,
	// Extend and customize it here, as needed:
	content: [
		'./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue,css}',
		'../../apps/client/src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue,css}',
		'../../packages/ui/src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue,css}',
		'../../packages/ui/node_modules/streamdown/dist/index.js',
	],
} satisfies Config;
