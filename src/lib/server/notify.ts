import { deleteSubscription, deviceSubscriptions, participantSubscriptions } from './repo';
import { sendWebPush } from './webpush';

export interface PushEnv {
	DB: D1Database;
	VAPID_PUBLIC_KEY: string;
	VAPID_PRIVATE_KEY?: string;
	VAPID_SUBJECT: string;
}

export interface Summons {
	title: string;
	body: string;
	/** Relative URL opened when the notification is tapped. */
	url: string;
	tag?: string;
}

/**
 * Sends a notification to every device that created or drew in a corpse, or
 * only to `deviceId`. Dead subscriptions are pruned.
 */
export async function summon(
	env: PushEnv,
	corpseId: string,
	message: Summons,
	options: { deviceId?: string | null; excludeDeviceId?: string | null } = {}
): Promise<number> {
	if (!env.VAPID_PRIVATE_KEY) {
		console.warn('VAPID_PRIVATE_KEY is not set; skipping push');
		return 0;
	}
	if (options.deviceId === null) return 0;

	const keys = {
		publicKey: env.VAPID_PUBLIC_KEY,
		privateKey: env.VAPID_PRIVATE_KEY,
		subject: env.VAPID_SUBJECT
	};
	const subs = (
		options.deviceId
			? await deviceSubscriptions(env.DB, options.deviceId)
			: await participantSubscriptions(env.DB, corpseId)
	).filter((s) => !options.excludeDeviceId || s.device_id !== options.excludeDeviceId);

	const results = await Promise.allSettled(
		subs.map(async (sub) => {
			const result = await sendWebPush(
				{ endpoint: sub.endpoint, p256dh: sub.keys_p256dh, auth: sub.keys_auth },
				{ ...message, tag: message.tag ?? corpseId },
				keys
			);
			if (result.gone) await deleteSubscription(env.DB, sub.id);
			else if (!result.ok) console.warn(`push failed with status ${result.status}`);
			return result.ok;
		})
	);
	return results.filter((r) => r.status === 'fulfilled' && r.value).length;
}
