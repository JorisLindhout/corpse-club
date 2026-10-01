import { error } from '@sveltejs/kit';
import { SECTION_COUNT, isUuid } from '$lib/constants';
import { getCorpse } from '$lib/server/repo';
import { getEnv, objectResponse } from '$lib/server/http';
import type { RequestHandler } from './$types';

/** Full sections are only visible once the corpse is complete, or to their own hand. */
export const GET: RequestHandler = async (event) => {
	const { id } = event.params;
	const position = Number(event.params.position);
	if (!isUuid(id) || !Number.isInteger(position) || position < 1 || position > SECTION_COUNT) {
		error(404, 'No such section');
	}

	const found = await getCorpse(getEnv(event).DB, id);
	const section = found?.sections.find((s) => s.position === position);
	if (!found || !section?.image_key) error(404, 'No such section');

	const complete = found.corpse.status === 'complete';
	if (!complete && section.device_id !== event.locals.deviceId) error(404, 'No such section');

	const object = await getEnv(event).BUCKET.get(section.image_key);
	if (!object) error(404, 'No such section');
	return objectResponse(object, complete);
};
