import fs from 'fs';
import path from 'path';

const ROOT_DIR = process.cwd(); // project root
const DUMP_DIR = path.join(ROOT_DIR, 'schema-dump'); // target folder

function walk(dir) {
	let results = [];

	const list = fs.readdirSync(dir);
	for (const file of list) {
		const fullPath = path.join(dir, file);
		const stat = fs.statSync(fullPath);

		if (stat && stat.isDirectory()) {
			// ignore unwanted folders (added 'schema-dump' to prevent scanning previous dumps)
			if (
				[
					'node_modules',
					'.git',
					'.svelte-kit',
					'.wrangler',
					'dist',
					'build',
					'schema-dump'
				].includes(file)
			) {
				continue;
			}

			results = results.concat(walk(fullPath));
		} else if (file.endsWith('.drizzle.ts')) {
			results.push(fullPath);
		}
	}

	return results;
}

function main() {
	const files = walk(ROOT_DIR);

	if (files.length === 0) {
		console.log('No *.drizzle.ts files found.');
		return;
	}

	// Ensure the output directory exists
	if (!fs.existsSync(DUMP_DIR)) {
		fs.mkdirSync(DUMP_DIR, { recursive: true });
		console.log('Created /schema-dump directory.');
	}

	// Copy each file to the output directory
	for (const file of files) {
		const fileName = path.basename(file);
		const destPath = path.join(DUMP_DIR, fileName);

		fs.copyFileSync(file, destPath);

		// Optional: Get relative path just for cleaner console output
		const relativeSource = path.relative(ROOT_DIR, file);
		console.log(`Copied: ${relativeSource} -> schema-dump/${fileName}`);
	}

	console.log(`\nSuccess! Copied ${files.length} file(s) to /schema-dump.`);
}

main();
