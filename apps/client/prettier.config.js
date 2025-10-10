import prettierConfig from '../../prettier.config.js';

/** @type {import('prettier').Config} */
export default {
	...prettierConfig,
	plugins: [...prettierConfig.plugins, 'prettier-plugin-tailwindcss'],
};
