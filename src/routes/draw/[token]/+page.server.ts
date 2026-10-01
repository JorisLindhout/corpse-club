import { error } from '@sveltejs/kit';
import { SECTION_COUNT, SECTION_LABELS, isUuid } from '$lib/constants';
import { DEFAULT_PREVIEW } from '$lib/seo';
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

	const part = SECTION_LABELS[section.position - 1].toLowerCase();
	const before = SECTION_LABELS[section.position - 2]?.toLowerCase();
	const it = section.position === SECTION_COUNT ? 'them' : 'it';

	return {
		preview:
			state === 'open'
				? {
						...DEFAULT_PREVIEW,
						title: `You have been handed ${part}`,
						description: before
							? `Draw ${it} on paper. You will see only the edge of ${before}.`
							: `Draw ${it} on paper, then pass the corpse to the next hand.`
					}
				: undefined,
		token,
		corpseId: corpse.id,
		position: section.position,
		isLast: section.position === SECTION_COUNT,
		isCreator: corpse.creator_device_id === event.locals.deviceId,
		state,
		overlapUrl: state === 'open' && section.position > 1 ? `/api/draw/${token}/overlap` : null
	};
};
