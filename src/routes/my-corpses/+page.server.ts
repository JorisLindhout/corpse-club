import { fail } from '@sveltejs/kit';
import { isUuid } from '$lib/constants';
import { hideCorpse, myCorpses } from '$lib/server/repo';
import { getEnv, rateLimit } from '$lib/server/http';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
	corpses: await myCorpses(getEnv(event).DB, event.locals.deviceId)
});

export const actions: Actions = {
	remove: async (event) => {
		await rateLimit(event, 'remove', 30);
		const id = (await event.request.formData()).get('id');
		if (!isUuid(id)) return fail(400, { message: 'No such corpse' });
		await hideCorpse(getEnv(event).DB, event.locals.deviceId, id);
	}
};
