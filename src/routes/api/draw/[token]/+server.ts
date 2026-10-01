import { error, json } from '@sveltejs/kit';
import { isUuid } from '$lib/constants';
import { drawState, getByToken } from '$lib/server/repo';
import { getEnv } from '$lib/server/http';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const { token } = event.params;
	if (!isUuid(token)) error(404, 'This invitation leads nowhere');
	const found = await getByToken(getEnv(event).DB, token);
	if (!found) error(404, 'This invitation leads nowhere');

	const { corpse, sections, section } = found;
	return json(
		{
			corpseId: corpse.id,
			position: section.position,
			state: drawState(corpse, sections, section),
			overlapUrl: section.position > 1 ? `/api/draw/${token}/overlap` : null
		},
		{ headers: { 'cache-control': 'private, no-store' } }
	);
};
