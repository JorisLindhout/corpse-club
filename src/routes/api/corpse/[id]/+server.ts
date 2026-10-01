import { error, json } from '@sveltejs/kit';
import { isUuid } from '$lib/constants';
import { getCorpse } from '$lib/server/repo';
import { getEnv } from '$lib/server/http';
import { corpseView } from '$lib/server/views';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const { id } = event.params;
	if (!isUuid(id)) error(404, 'No such corpse');
	const found = await getCorpse(getEnv(event).DB, id);
	if (!found) error(404, 'No such corpse');
	return json(corpseView(found, event.locals.deviceId), {
		headers: { 'cache-control': 'private, no-store' }
	});
};
