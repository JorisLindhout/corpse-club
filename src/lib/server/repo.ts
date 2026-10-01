import { SECTION_COUNT } from '../constants';

export type CorpseStatus = 'in_progress' | 'complete' | 'expired';
export type SectionStatus = 'pending' | 'drawing' | 'complete';

export interface CorpseRow {
	id: string;
	status: CorpseStatus;
	created_at: number;
	completed_at: number | null;
	creator_device_id: string | null;
}

export interface SectionRow {
	id: string;
	corpse_id: string;
	position: number;
	invite_token: string;
	status: SectionStatus;
	image_key: string | null;
	contributor_name: string | null;
	device_id: string | null;
	completed_at: number | null;
	reminder_count: number;
	last_reminder_at: number | null;
	activated_at: number | null;
}

export interface CorpseWithSections {
	corpse: CorpseRow;
	sections: SectionRow[];
}

/** What a holder of an invite token may do with its section. */
export type DrawState = 'open' | 'complete' | 'locked' | 'expired';

export async function ensureDevice(db: D1Database, deviceId: string): Promise<void> {
	await db
		.prepare('INSERT OR IGNORE INTO devices (id, created_at) VALUES (?, ?)')
		.bind(deviceId, Date.now())
		.run();
}

export async function createCorpse(
	db: D1Database,
	deviceId: string
): Promise<{ corpseId: string; token: string }> {
	const now = Date.now();
	const corpseId = crypto.randomUUID();
	const tokens = Array.from({ length: SECTION_COUNT }, () => crypto.randomUUID());

	await db.batch([
		db.prepare('INSERT OR IGNORE INTO devices (id, created_at) VALUES (?, ?)').bind(deviceId, now),
		db
			.prepare(
				'INSERT INTO corpses (id, status, created_at, creator_device_id) VALUES (?, ?, ?, ?)'
			)
			.bind(corpseId, 'in_progress', now, deviceId),
		...tokens.map((token, i) =>
			db
				.prepare(
					`INSERT INTO sections (id, corpse_id, position, invite_token, status, activated_at)
					 VALUES (?, ?, ?, ?, 'pending', ?)`
				)
				.bind(crypto.randomUUID(), corpseId, i + 1, token, i === 0 ? now : null)
		)
	]);

	return { corpseId, token: tokens[0] };
}

async function sectionsFor(db: D1Database, corpseId: string): Promise<SectionRow[]> {
	const { results } = await db
		.prepare('SELECT * FROM sections WHERE corpse_id = ? ORDER BY position')
		.bind(corpseId)
		.all<SectionRow>();
	return results;
}

export async function getCorpse(db: D1Database, id: string): Promise<CorpseWithSections | null> {
	const corpse = await db.prepare('SELECT * FROM corpses WHERE id = ?').bind(id).first<CorpseRow>();
	if (!corpse) return null;
	return { corpse, sections: await sectionsFor(db, id) };
}

export async function getByToken(
	db: D1Database,
	token: string
): Promise<(CorpseWithSections & { section: SectionRow }) | null> {
	const section = await db
		.prepare('SELECT * FROM sections WHERE invite_token = ?')
		.bind(token)
		.first<SectionRow>();
	if (!section) return null;
	const found = await getCorpse(db, section.corpse_id);
	if (!found) return null;
	return { ...found, section };
}

export function drawState(
	corpse: CorpseRow,
	sections: SectionRow[],
	section: SectionRow
): DrawState {
	if (corpse.status === 'expired') return 'expired';
	if (section.status === 'complete') return 'complete';
	const previous = sections.find((s) => s.position === section.position - 1);
	if (previous && previous.status !== 'complete') return 'locked';
	return 'open';
}

/** The section currently waiting for a hand, if any. */
export function activeSection(sections: SectionRow[]): SectionRow | undefined {
	return sections.find((s) => s.status !== 'complete');
}

export async function markDrawing(db: D1Database, sectionId: string): Promise<void> {
	await db
		.prepare("UPDATE sections SET status = 'drawing' WHERE id = ? AND status = 'pending'")
		.bind(sectionId)
		.run();
}

/**
 * Seals a section. Returns false if it was already sealed by someone else.
 * Activates the next section, or completes the corpse after the last one.
 */
export async function completeSection(
	db: D1Database,
	input: {
		section: SectionRow;
		imageKey: string;
		contributorName: string | null;
		deviceId: string;
	}
): Promise<{ sealed: boolean; corpseComplete: boolean }> {
	const now = Date.now();
	const { section } = input;

	const sealed = await db
		.prepare(
			`UPDATE sections
			 SET status = 'complete', image_key = ?, contributor_name = ?, device_id = ?, completed_at = ?
			 WHERE id = ? AND status != 'complete'`
		)
		.bind(input.imageKey, input.contributorName, input.deviceId, now, section.id)
		.run();
	if (!sealed.meta.changes) return { sealed: false, corpseComplete: false };

	const isLast = section.position === SECTION_COUNT;
	await db.batch([
		db
			.prepare('INSERT OR IGNORE INTO devices (id, created_at) VALUES (?, ?)')
			.bind(input.deviceId, now),
		isLast
			? db
					.prepare(
						"UPDATE corpses SET status = 'complete', completed_at = ? WHERE id = ? AND status = 'in_progress'"
					)
					.bind(now, section.corpse_id)
			: db
					.prepare('UPDATE sections SET activated_at = ? WHERE corpse_id = ? AND position = ?')
					.bind(now, section.corpse_id, section.position + 1)
	]);

	return { sealed: true, corpseComplete: isLast };
}

export function isParticipant(
	corpse: CorpseRow,
	sections: SectionRow[],
	deviceId: string
): boolean {
	return corpse.creator_device_id === deviceId || sections.some((s) => s.device_id === deviceId);
}

export interface MyCorpse {
	id: string;
	status: CorpseStatus;
	createdAt: number;
	completedAt: number | null;
	isCreator: boolean;
	sections: { position: number; status: SectionStatus; name: string | null }[];
}

export async function myCorpses(db: D1Database, deviceId: string): Promise<MyCorpse[]> {
	const { results: corpses } = await db
		.prepare(
			`SELECT * FROM corpses
			 WHERE creator_device_id = ?1
			    OR id IN (SELECT corpse_id FROM sections WHERE device_id = ?1)
			 ORDER BY created_at DESC
			 LIMIT 200`
		)
		.bind(deviceId)
		.all<CorpseRow>();
	if (corpses.length === 0) return [];

	const placeholders = corpses.map(() => '?').join(',');
	const { results: sections } = await db
		.prepare(
			`SELECT corpse_id, position, status, contributor_name FROM sections
			 WHERE corpse_id IN (${placeholders}) ORDER BY position`
		)
		.bind(...corpses.map((c) => c.id))
		.all<Pick<SectionRow, 'corpse_id' | 'position' | 'status' | 'contributor_name'>>();

	return corpses.map((c) => ({
		id: c.id,
		status: c.status,
		createdAt: c.created_at,
		completedAt: c.completed_at,
		isCreator: c.creator_device_id === deviceId,
		sections: sections
			.filter((s) => s.corpse_id === c.id)
			.map((s) => ({ position: s.position, status: s.status, name: s.contributor_name }))
	}));
}

export interface SubscriptionRow {
	id: string;
	corpse_id: string;
	device_id: string | null;
	endpoint: string;
	keys_p256dh: string;
	keys_auth: string;
}

export async function saveSubscription(
	db: D1Database,
	input: { corpseId: string; deviceId: string; endpoint: string; p256dh: string; auth: string }
): Promise<void> {
	await db.batch([
		db
			.prepare('INSERT OR IGNORE INTO devices (id, created_at) VALUES (?, ?)')
			.bind(input.deviceId, Date.now()),
		db
			.prepare(
				`INSERT INTO push_subscriptions (id, corpse_id, device_id, endpoint, keys_p256dh, keys_auth, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT (corpse_id, endpoint) DO UPDATE SET
				   device_id = excluded.device_id,
				   keys_p256dh = excluded.keys_p256dh,
				   keys_auth = excluded.keys_auth`
			)
			.bind(
				crypto.randomUUID(),
				input.corpseId,
				input.deviceId,
				input.endpoint,
				input.p256dh,
				input.auth,
				Date.now()
			)
	]);
}

export async function subscriptionsFor(
	db: D1Database,
	corpseId: string,
	deviceId?: string | null
): Promise<SubscriptionRow[]> {
	const query = deviceId
		? db
				.prepare('SELECT * FROM push_subscriptions WHERE corpse_id = ? AND device_id = ?')
				.bind(corpseId, deviceId)
		: db.prepare('SELECT * FROM push_subscriptions WHERE corpse_id = ?').bind(corpseId);
	const { results } = await query.all<SubscriptionRow>();
	return results;
}

export async function deleteSubscription(db: D1Database, id: string): Promise<void> {
	await db.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(id).run();
}

/** Fixed-window counter. Returns true when the request is within the limit. */
export async function hitRateLimit(
	db: D1Database,
	key: string,
	limit: number,
	windowSeconds: number
): Promise<boolean> {
	const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
	const row = await db
		.prepare(
			`INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
			 ON CONFLICT (key) DO UPDATE SET
			   count = CASE WHEN window_start = ?2 THEN count + 1 ELSE 1 END,
			   window_start = ?2
			 RETURNING count`
		)
		.bind(key, windowStart)
		.first<{ count: number }>();
	return (row?.count ?? 0) <= limit;
}
