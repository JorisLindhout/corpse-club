import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { DEVICE_COOKIE, isUuid } from '$lib/constants';

const FIVE_YEARS = 60 * 60 * 24 * 365 * 5;

export const handle: Handle = async ({ event, resolve }) => {
	const header = event.request.headers.get('x-device-id');
	const cookie = event.cookies.get(DEVICE_COOKIE);

	let deviceId = isUuid(header) ? header : isUuid(cookie) ? cookie : null;
	if (!deviceId) deviceId = crypto.randomUUID();
	if (deviceId !== cookie && !isUuid(header) && !building) {
		// Readable by client JS so it can be mirrored into localStorage.
		event.cookies.set(DEVICE_COOKIE, deviceId, {
			path: '/',
			httpOnly: false,
			sameSite: 'lax',
			maxAge: FIVE_YEARS
		});
	}
	event.locals.deviceId = deviceId;

	const response = await resolve(event);
	// Invite tokens live in URLs; never leak them through Referer.
	response.headers.set('referrer-policy', 'no-referrer');
	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('x-frame-options', 'DENY');
	response.headers.set('permissions-policy', 'camera=(self), microphone=(), geolocation=()');
	return response;
};
