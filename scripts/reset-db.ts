import { db, migrate, sql } from '../packages/core/src/drizzle.js';

export async function resetDatabase() {
	// Drop and recreate the public schema to completely reset the database
	await db.execute(sql`
		DROP SCHEMA IF EXISTS public CASCADE;
		CREATE SCHEMA public;
	`);

	// Run migrations directly using Drizzle's migrate function
	await migrate(db, {
		migrationsFolder: new URL('../packages/core/drizzle/migrations', import.meta.url).pathname,
		migrationsSchema: 'public',
	});
}

if (import.meta.url === `file://${process.argv[1]}`) {
	try {
		await resetDatabase();
	} catch (error) {
		// biome-ignore lint/suspicious/noConsole: no need for a logger here
		console.error('Error resetting database:', error);
		process.exit(1);
	}
}
