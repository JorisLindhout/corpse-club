import { error } from '@sveltejs/kit';
import { NEW_CORPSE, SECTION_COUNT, SECTION_LABELS, isUuid } from '$lib/constants';
import { DEFAULT_PREVIEW } from '$lib/seo';
import { drawState, getByToken, isReachable, markDrawing } from '$lib/server/repo';
import { getEnv } from '$lib/server/http';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { token } = event.params;
	const env = getEnv(event);
	const { deviceId } = event.locals;

	// The head of a corpse that does not exist until it is sealed.
	if (token === NEW_CORPSE) {
		return {
			preview: undefined,
			token: null,
			corpseId: null,
			position: 1,
			isLast: false,
			isMine: false,
			reachable: await isReachable(env.DB, deviceId),
			state: 'new' as const,
			overlapUrl: null
		};
	}

	if (!isUuid(token)) error(404, 'This invitation leads nowhere');
	const found = await getByToken(env.DB, token);
	if (!found) error(404, 'This invitation leads nowhere');

	const { corpse, sections, section } = found;
	const state = drawState(corpse, sections, section);
	if (state === 'open' && section.status === 'pending') await markDrawing(env.DB, section.id);

	const part = SECTION_LABELS[section.position - 1].toLowerCase();

	return {
		preview:
			state === 'open'
				? { ...DEFAULT_PREVIEW, title: `You are summoned to draw ${part}` }
				: undefined,
		token,
		corpseId: corpse.id,
		position: section.position,
		isLast: section.position === SECTION_COUNT,
		isMine: section.device_id === deviceId,
		reachable: await isReachable(env.DB, deviceId),
		state,
		overlapUrl: state === 'open' && section.position > 1 ? `/api/draw/${token}/overlap` : null
	};
};
