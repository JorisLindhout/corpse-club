import { error } from '@sveltejs/kit';
import { isUuid } from '$lib/constants';
import { drawState, getByToken } from '$lib/server/repo';
import { getEnv, objectResponse, overlapKey } from '$lib/server/http';
import type { RequestHandler } from './$types';

/** The bottom strip of the previous section: the only glimpse the next acolyte gets. */
export const GET: RequestHandler = async (event) => {
	const { token } = event.params;
	if (!isUuid(token)) error(404, 'This invitation leads nowhere.');
	const env = getEnv(event);
	const found = await getByToken(env.DB, token);
	if (!found || drawState(found.corpse, found.sections, found.section) !== 'open') {
		error(404, 'Nothing to see.');
	}

	const previous = found.sections.find((s) => s.position === found.section.position - 1);
	if (!previous?.image_key) error(404, 'Nothing to see.');

	const object = await env.BUCKET.get(overlapKey(previous.image_key));
	if (!object) error(404, 'Nothing to see.');
	return objectResponse(object, false);
};
