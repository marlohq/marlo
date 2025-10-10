import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';
// @ts-expect-error Package doesn't have types
import electron from 'astro-electron';

export default defineConfig({
	integrations: [
		react({
			babel: {
				plugins: ['babel-plugin-react-compiler'],
			},
		}),
		tailwind({
			applyBaseStyles: false,
		}),
		electron(),
	],
	outDir: 'dist-astro',
	build: {
		format: 'file',
	},
	server: {
		port: 5002,
	},
	vite: {
		server: {
			watch: {
				ignored: ['**/dist-electron/**', '**/dist-astro/**'],
			},
		},
		clearScreen: false,
		optimizeDeps: {
			exclude: ['electron'],
		},
		build: {
			rollupOptions: {
				output: {
					format: 'es',
				},
			},
		},
		ssr: {
			noExternal: ['@fontsource-variable/inter'],
		},
	},
	// Copy service worker to public directory
	publicDir: './public',
});
