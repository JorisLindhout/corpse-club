import { error } from '@sveltejs/kit';
import { SECTION_COUNT, isUuid } from '$lib/constants';
import { drawState, getByToken, markDrawing } from '$lib/server/repo';
import { getEnv } from '$lib/server/http';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { token } = event.params;
	if (!isUuid(token)) error(404, 'This invitation leads nowhere');
	const env = getEnv(event);
	const found = await getByToken(env.DB, token);
	if (!found) error(404, 'This invitation leads nowhere');

	const { corpse, sections, section } = found;
	const state = drawState(corpse, sections, section);
	if (state === 'open' && section.status === 'pending') await markDrawing(env.DB, section.id);

	return {
		token,
		corpseId: corpse.id,
		position: section.position,
		isLast: section.position === SECTION_COUNT,
		isCreator: corpse.creator_device_id === event.locals.deviceId,
		state,
		overlapUrl: state === 'open' && section.position > 1 ? `/api/draw/${token}/overlap` : null
	};
};
