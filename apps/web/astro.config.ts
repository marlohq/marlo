import nodejs from '@astrojs/node';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';

function throwViteExternalPackageError(err: unknown, packageName: string) {
	const error = new Error(
		`"${packageName}" is an external package that failed to load. See \`astro.config.ts\` for more details.`,
	);
	error.cause = err;
	throw error;
}

await import('roarr').catch((err) => throwViteExternalPackageError(err, 'roarr'));
await import('@sentry/node').catch((err) => throwViteExternalPackageError(err, '@sentry/node'));

// https://astro.build/config
export default defineConfig({
	output: 'server',
	adapter: nodejs({
		mode: 'standalone',
	}),
	integrations: [
		{
			// Inject the instrument module on every route to ensure
			// that instrumentation is always enabled in production.
			name: 'instrument',
			hooks: {
				'astro:config:setup': ({ command, injectScript }) => {
					injectScript('page-ssr', `import "@workspace/core/instrument.ts";`);
				},
			},
		},
		tailwind({
			applyBaseStyles: false,
		}),
		react({
			babel: {
				plugins: ['babel-plugin-react-compiler'],
			},
		}),
	],
	server: {
		// Host must be set to 0.0.0.0 for the app to be accessible from outside the container
		// See https://help.railway.com/questions/deploying-astro-on-railway-48e4cd56
		host: '0.0.0.0',
		port: 5001,
	},
	vite: {
		ssr: {
			// Roarr doesn't work when bundled, so mark it as external here.
			external: ['roarr', '@sentry/node'],
			noExternal: ['html-to-text'],
		},
	},
});
