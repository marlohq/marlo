import { defineConfig } from 'drizzle-kit';
import { env } from './packages/core/src/env.ts';

export default defineConfig({
	dialect: 'postgresql',
	out: './packages/core/drizzle/migrations',
	schema: ['./packages/core/drizzle/schema.ts', './packages/core/drizzle/relations.ts'],
	dbCredentials: {
		url: env.require('DATABASE_URL'),
	},
	// Print all statements
	verbose: true,
	// Always ask for confirmation
	strict: true,
	migrations: {
		schema: 'public',
	},
});
