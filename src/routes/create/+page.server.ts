import { redirect } from '@sveltejs/kit';
import { createCorpse } from '$lib/server/repo';
import { getEnv, rateLimit } from '$lib/server/http';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async (event) => {
		await rateLimit(event, 'create', 10);
		const { token } = await createCorpse(getEnv(event).DB, event.locals.deviceId);
		redirect(303, `/draw/${token}`);
	}
};
