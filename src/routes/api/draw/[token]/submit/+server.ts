import { error, json } from '@sveltejs/kit';
import { SECTION_COUNT, SECTION_LABELS, isUuid } from '$lib/constants';
import { completeSection, drawState, getByToken } from '$lib/server/repo';
import { getEnv, rateLimit, readSection, sectionKey, storeSection } from '$lib/server/http';
import { summon } from '$lib/server/notify';
import { assembleCorpse } from '$lib/server/assemble';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	await rateLimit(event, 'submit', 10);

	const { token } = event.params;
	if (!isUuid(token)) error(404, 'This invitation leads nowhere');
	const env = getEnv(event);
	const found = await getByToken(env.DB, token);
	if (!found) error(404, 'This invitation leads nowhere');

	const { corpse, sections, section } = found;
	const state = drawState(corpse, sections, section);
	if (state === 'complete') error(409, 'This section has already been drawn');
	if (state === 'expired') error(410, 'This corpse has rotted');
	if (state === 'locked') error(409, 'The previous hand is still drawing');

	const isLast = section.position === SECTION_COUNT;
	const upload = await readSection(event.request, isLast);
	const { contributorName } = upload;

	const imageKey = sectionKey(corpse.id, section.position, upload.image);
	if (await env.BUCKET.head(imageKey)) error(409, 'This section has already been drawn');
	await storeSection(env.BUCKET, imageKey, upload);

	const deviceId = event.locals.deviceId;
	const { sealed, corpseComplete } = await completeSection(env.DB, {
		section,
		imageKey,
		contributorName,
		deviceId
	});
	if (!sealed) error(409, 'This section has already been drawn');

	const ctx = event.platform?.ctx;
	if (corpseComplete) {
		const keys = sections.map((s) => (s.id === section.id ? imageKey : s.image_key));
		const assembling = assembleCorpse(env, corpse.id, keys);
		if (ctx) ctx.waitUntil(assembling);
		else await assembling;
	}

	const part = SECTION_LABELS[section.position - 1].toLowerCase();
	const nextPart = SECTION_LABELS[section.position]?.toLowerCase();
	const settled = summon(
		env,
		corpse.id,
		corpseComplete
			? {
					title: 'The corpse is complete',
					body: 'Three hands. One creature. Come and look.',
					url: `/c/${corpse.id}`
				}
			: {
					title: `${part[0].toUpperCase()}${part.slice(1)} is drawn`,
					body: `${contributorName ?? 'A hand'} drew ${part}. Now for ${nextPart}.`,
					url: `/c/${corpse.id}/status`
				},
		{ excludeDeviceId: deviceId }
	).catch((e) => console.error('push failed', e));
	if (ctx) ctx.waitUntil(settled);
	else await settled;

	// Like the folded paper, the corpse passes from hand to hand.
	const next = sections.find((s) => s.position === section.position + 1);
	return json({
		corpseId: corpse.id,
		position: section.position,
		complete: corpseComplete,
		nextInvitePath: next ? `/draw/${next.invite_token}` : null
	});
};
