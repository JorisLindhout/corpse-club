import { error, redirect } from '@sveltejs/kit';
import { isUuid } from '$lib/constants';
import { getCorpse, isParticipant } from '$lib/server/repo';
import { getEnv } from '$lib/server/http';
import { DEFAULT_PREVIEW, type Preview } from '$lib/seo';
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
	const contributors = sections.map((s) => s.contributor_name);
	const names = contributors.map((n) => n ?? 'Anonymous');
	const byline = contributors.every((n) => !n)
		? 'Drawn by three anonymous hands'
		: `Drawn by ${names.slice(0, -1).join(', ')} & ${names.at(-1)}`;
	const hasAssembled = complete ? Boolean(await env.BUCKET.head(`corpses/${id}/assembled`)) : false;

	return {
		id,
		status: corpse.status,
		completedAt: corpse.completed_at,
		contributors,
		byline,
		participant: isParticipant(corpse, sections, event.locals.deviceId),
		hasAssembled,
		preview: complete
			? ({
					...DEFAULT_PREVIEW,
					title: 'The corpse is complete',
					description: byline,
					...(hasAssembled && {
						image: `/api/corpse/${id}/image`,
						type: 'image/webp',
						width: 1000,
						height: 2250,
						alt: `An exquisite corpse: head, torso and legs drawn by three hands, unfolded. ${byline}.`
					})
				} satisfies Preview)
			: undefined
	};
};
