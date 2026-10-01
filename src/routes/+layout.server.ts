import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, platform }) => {
	let vapidPublicKey = '';
	try {
		vapidPublicKey = platform?.env?.VAPID_PUBLIC_KEY ?? '';
	} catch {
		// Prerendered routes have no platform bindings.
	}
	return { deviceId: locals.deviceId, vapidPublicKey };
};
