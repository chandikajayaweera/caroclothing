import { env as dynamicEnv } from '$env/dynamic/private';
import { envSchema } from './env.zod';
import type { z } from 'zod';

function formatErrors(issues: z.core.$ZodIssue[]) {
	return issues.reduce(
		(acc, issue) => {
			const path = issue.path[0] as string;
			if (!acc[path]) acc[path] = [];
			acc[path].push(issue.message);
			return acc;
		},
		{} as Record<string, string[]>
	);
}

const result = envSchema.safeParse(dynamicEnv);

if (!result.success) {
	const fieldErrors = formatErrors(result.error.issues);

	const messages = Object.entries(fieldErrors)
		.map(([key, msgs]) => `  ${key}: ${msgs.join(', ')}`)
		.join('\n');

	console.error('❌ Invalid Environment Variables:\n' + messages);
	throw new Error('Invalid Environment Variables');
}

export const env = result.data;
