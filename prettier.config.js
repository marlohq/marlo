// Source: https://github.com/withastro/astro
// This is the prettier config that is used by the rest of the Astro team (Platform, DX, etc.)
// we should be using it too, to keep things consistent so that other team members can easily
// move in and out of this project as needed.

/** @type {import('prettier').Config} */
export default {
	printWidth: 100,
	semi: true,
	singleQuote: true,
	tabWidth: 2,
	trailingComma: 'all',
	useTabs: true,
	plugins: ['prettier-plugin-astro', 'prettier-plugin-jsdoc', 'prettier-plugin-tailwindcss'],
	overrides: [
		{
			files: ['.*', '*.md', '*.toml', '*.yml'],
			options: {
				useTabs: false,
			},
		},
		{
			files: ['**/*.astro'],
			options: {
				parser: 'astro',
			},
		},
		// disables formatting for some files without a .prettierignore 😊
		{
			files: ['**/pnpm-lock.yaml'],
			options: {
				requirePragma: true,
			},
		},
		{
			files: ['**/*.jsonc'],
			options: {
				trailingComma: 'none',
			},
		},
	],
};
