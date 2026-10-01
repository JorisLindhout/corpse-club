import { myCorpses } from '$lib/server/repo';
import { getEnv } from '$lib/server/http';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
	corpses: await myCorpses(getEnv(event).DB, event.locals.deviceId)
});
