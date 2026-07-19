import { sql, type SQL } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from './index';
import { d1BatchGuard } from './d1-batch.drizzle';

type Db = ReturnType<typeof getDb>;

function guardStatements(db: Db, passed: SQL) {
	const nonce = nanoid();

	return [
		db.insert(d1BatchGuard).values({
			nonce,
			passed: sql`CASE WHEN ${passed} THEN 1 ELSE 0 END`
		}),
		db.delete(d1BatchGuard).where(sql`${d1BatchGuard.nonce} = ${nonce}`)
	] as const;
}

export function guardBatchCondition(db: Db, condition: SQL) {
	return guardStatements(db, condition);
}

export function guardPreviousBatchChanges(db: Db, expectedChanges = 1) {
	return guardStatements(db, sql`changes() = ${expectedChanges}`);
}

export function isD1BatchGuardError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return message.includes('d1_batch_guard_passed');
}
