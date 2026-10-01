import { error, json } from '@sveltejs/kit';
import { saveSubscription } from '$lib/server/repo';
import { getEnv, rateLimit } from '$lib/server/http';
import { b64urlDecode } from '$lib/server/webpush';
import type { RequestHandler } from './$types';

const B64URL = /^[A-Za-z0-9_-]+$/;

function decodedLength(value: unknown): number {
	if (typeof value !== 'string' || !B64URL.test(value) || value.length > 200) return -1;
	try {
		return b64urlDecode(value).length;
	} catch {
		return -1;
	}
}

export const POST: RequestHandler = async (event) => {
	await rateLimit(event, 'subscribe', 20);

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Malformed summons');
	}
	const { subscription } = (body ?? {}) as {
		subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
	};

	const endpoint = subscription?.endpoint;
	if (typeof endpoint !== 'string' || endpoint.length > 2048) error(400, 'Invalid endpoint');
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		error(400, 'Invalid endpoint');
	}
	if (url.protocol !== 'https:') error(400, 'Invalid endpoint');

	const p256dh = subscription?.keys?.p256dh;
	const auth = subscription?.keys?.auth;
	if (decodedLength(p256dh) !== 65 || decodedLength(auth) !== 16) error(400, 'Invalid keys');

	await saveSubscription(getEnv(event).DB, {
		deviceId: event.locals.deviceId,
		endpoint,
		p256dh: p256dh as string,
		auth: auth as string
	});
	return json({ ok: true }, { status: 201 });
};
