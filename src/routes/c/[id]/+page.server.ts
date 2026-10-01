import { error, redirect } from '@sveltejs/kit';
import { isUuid } from '$lib/constants';
import { getCorpse, isParticipant } from '$lib/server/repo';
import { getEnv } from '$lib/server/http';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { id } = event.params;
	if (!isUuid(id)) error(404, 'No such corpse');
	const env = getEnv(event);
	const found = await getCorpse(env.DB, id);
	if (!found) error(404, 'No such corpse');

	const { corpse, sections } = found;
	if (corpse.status === 'in_progress') redirect(307, `/c/${id}/status`);

	const complete = corpse.status === 'complete';
	return {
		id,
		status: corpse.status,
		completedAt: corpse.completed_at,
		contributors: sections.map((s) => s.contributor_name),
		participant: isParticipant(corpse, sections, event.locals.deviceId),
		hasAssembled: complete ? Boolean(await env.BUCKET.head(`corpses/${id}/assembled`)) : false
	};
};
