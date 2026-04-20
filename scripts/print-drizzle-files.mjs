import fs from 'fs';
import path from 'path';

const ROOT_DIR = process.cwd(); // project root

function walk(dir) {
	let results = [];

	const list = fs.readdirSync(dir);
	for (const file of list) {
		const fullPath = path.join(dir, file);
		const stat = fs.statSync(fullPath);

		if (stat && stat.isDirectory()) {
			// ignore unwanted folders
			if (['node_modules', '.git', '.svelte-kit', '.wrangler', 'dist', 'build'].includes(file)) {
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

	for (const file of files) {
		const relativePath = path.relative(ROOT_DIR, file);
		const content = fs.readFileSync(file, 'utf-8');

		console.log(`${relativePath}:\n${content}\n`);
	}
}

main();
