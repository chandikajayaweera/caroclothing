import { env as dynamicPublicEnv } from '$env/dynamic/public';
import { clientEnvSchema } from './env.zod';
import type { ClientEnv } from './env.zod';
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

let _clientEnv: ClientEnv | undefined;

export function getClientEnv(): ClientEnv {
	if (_clientEnv) return _clientEnv;

	const result = clientEnvSchema.safeParse(dynamicPublicEnv);

	if (!result.success) {
		const fieldErrors = formatErrors(result.error.issues);
		const messages = Object.entries(fieldErrors)
			.map(([key, msgs]) => `  ${key}: ${msgs.join(', ')}`)
			.join('\n');
		console.error('❌ Invalid Public Environment Variables:\n' + messages);
		throw new Error('Invalid Public Environment Variables');
	}

	_clientEnv = result.data;
	return _clientEnv;
}
