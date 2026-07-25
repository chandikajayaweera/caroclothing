import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle-d1',
	dialect: 'sqlite',
	verbose: true,
	strict: true
});
