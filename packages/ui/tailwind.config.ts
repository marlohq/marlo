import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

export type { Config };

/**
 * This is the default base Tailwind config for the UI package. All packages & apps in the monorepo
 * should extend from this base config object.
 */
export default {
	// This effectively disables dark mode by default
	// https://tailwindcss.com/docs/dark-mode
	darkMode: 'selector',
	prefix: '',
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px',
			},
		},
		fontSize: {
			xs: '12px',
			sm: '13px',
			base: '14px',
			md: '15px',
			lg: '16px',
			xl: '18px',
			'2xl': '1.563rem',
			'3xl': '1.953rem',
			'4xl': '2.441rem',
			'5xl': '3.052rem',
		},
		extend: {
			gridTemplateRows: {
				layout: '64px 1fr',
			},
			gridTemplateColumns: {
				layout: '256px 1fr',
			},
			keyframes: {
				'accordion-down': {
					from: { height: '0' },
					to: { height: 'var(--radix-accordion-content-height)' },
				},
				'accordion-up': {
					from: { height: 'var(--radix-accordion-content-height)' },
					to: { height: '0' },
				},
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
			},
			transitionProperty: {
				size: 'width, height, max-width, max-height',
			},
			boxShadow: {
				sm: '0px 2px 4px 0px rgba(0, 0, 0, 0.08)',
				'3xl': `0px 0px 0px 1px rgba(0, 0, 0, 0.05),
				0px 1px 1px 0px rgba(0, 0, 0, 0.02),
				0px 2px 2px 0px rgba(0, 0, 0, 0.06),
				0px 3px 4px 0px rgba(0, 0, 0, 0.06),
				0px 4px 8px 0px rgba(0, 0, 0, 0.04)`,
				'4xl': `0.2px 0.2px 1.4px hsl(0 0 0 / 0.03),
    1.7px 2.3px 4px -0.2px hsl(0 0 0 / 0.07),
    4px 5.3px 9.3px -0.5px hsl(0 0 0 / 0.1),
    8.9px 11.9px 20.7px -0.7px hsl(0 0 0 / 0.14)`,
				toast: `0px 0px 0px 1px rgba(0, 0, 0, 0.08),
					0px 4px 4px 0px rgba(0, 0, 0, 0.04),
					0px 8px 4px 0px rgba(0, 0, 0, 0.02),
					0px 12px 4px 0px rgba(0, 0, 0, 0.02)`,
				'destructive-banner': `0px 0px 0px 1px rgba(220,38,38, 0.10),
					0px 4px 4px 0px rgba(220,38,38, 0.04),
					0px 8px 4px 0px rgba(220,38,38, 0.04),
					0px 12px 4px 0px rgba(220,38,38, 0.02)`,
			},
		},
	},
	plugins: [animate],
} satisfies Partial<Config>;
