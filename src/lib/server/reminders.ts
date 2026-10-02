import { FIRST_REMINDER_AFTER, NEXT_REMINDER_AFTER, SECTION_LABELS } from '../constants';
import { summon, type PushEnv, type Summons } from './notify';

interface StaleSection {
	id: string;
	corpse_id: string;
	position: number;
	reminder_count: number;
	last_reminder_at: number | null;
	activated_at: number;
	creator_device_id: string | null;
	previous_device_id: string | null;
}

export interface ReminderReport {
	reminded: number;
	expired: number;
}

/** The creator and the previous acolyte both hold the invite, so both are nudged. */
async function nudge(env: PushEnv, section: StaleSection, message: Summons) {
	const devices = new Set([section.creator_device_id, section.previous_device_id]);
	for (const deviceId of devices) {
		if (deviceId) await summon(env, section.corpse_id, message, { deviceId });
	}
}

/**
 * Hourly sweep: nudges whoever holds the invite 48h after a section becomes
 * drawable, again 24h later, and lays the corpse to rest 24h after that.
 */
export async function runReminders(env: PushEnv, now = Date.now()): Promise<ReminderReport> {
	const report: ReminderReport = { reminded: 0, expired: 0 };

	const { results } = await env.DB.prepare(
		`SELECT s.id, s.corpse_id, s.position, s.reminder_count, s.last_reminder_at, s.activated_at,
		        c.creator_device_id, p.device_id AS previous_device_id
		 FROM sections s
		 JOIN corpses c ON c.id = s.corpse_id
		 LEFT JOIN sections p ON p.corpse_id = s.corpse_id AND p.position = s.position - 1
		 WHERE c.status = 'in_progress'
		   AND s.status IN ('pending', 'drawing')
		   AND s.activated_at IS NOT NULL`
	).all<StaleSection>();

	for (const section of results) {
		const count = section.reminder_count ?? 0;
		const label = SECTION_LABELS[section.position - 1];
		const part = label.toLowerCase();
		const statusUrl = `/c/${section.corpse_id}/status`;

		const due =
			count === 0
				? section.activated_at <= now - FIRST_REMINDER_AFTER
				: (section.last_reminder_at ?? 0) <= now - NEXT_REMINDER_AFTER;
		if (!due) continue;

		if (count >= 2) {
			const expired = await env.DB.prepare(
				"UPDATE corpses SET status = 'expired' WHERE id = ? AND status = 'in_progress'"
			)
				.bind(section.corpse_id)
				.run();
			if (!expired.meta.changes) continue;
			report.expired++;
			await nudge(env, section, {
				title: 'The corpse has rotted',
				body: `No acolyte came for ${part}. It has been laid to rest.`,
				url: statusUrl
			});
			continue;
		}

		// Guard on the old count so overlapping runs never double-send.
		const claimed = await env.DB.prepare(
			'UPDATE sections SET reminder_count = ?, last_reminder_at = ? WHERE id = ? AND reminder_count = ?'
		)
			.bind(count + 1, now, section.id, count)
			.run();
		if (!claimed.meta.changes) continue;
		report.reminded++;

		await nudge(
			env,
			section,
			count === 0
				? {
						title: 'The corpse grows cold',
						body: `${label} has waited two days. Summon the acolyte again.`,
						url: statusUrl
					}
				: {
						title: 'Last rites',
						body: `${label} must be drawn within a day, or the corpse rots.`,
						url: statusUrl
					}
		);
	}

	await env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?')
		.bind(Math.floor(now / 1000) - 24 * 60 * 60)
		.run();

	return report;
}
