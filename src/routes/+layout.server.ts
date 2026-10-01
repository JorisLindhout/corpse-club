import type { LayoutServerLoad } from './$types';
import { building } from '$app/environment';

export const load: LayoutServerLoad = ({ locals, platform }) => {
	let vapidPublicKey = '';
	try {
		vapidPublicKey = platform?.env?.VAPID_PUBLIC_KEY ?? '';
	} catch {
		// Prerendered routes have no platform bindings.
	}
	// A prerendered page must not bake a random mark into its HTML.
	return { deviceId: building ? '' : locals.deviceId, vapidPublicKey };
};
