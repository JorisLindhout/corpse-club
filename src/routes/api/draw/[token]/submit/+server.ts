import { error, json } from '@sveltejs/kit';
import { SECTION_COUNT, isUuid } from '$lib/constants';
import { completeSection, drawState, getByToken } from '$lib/server/repo';
import { getEnv, overlapKey, rateLimit, readImage, sanitizeName } from '$lib/server/http';
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

	const form = await event.request.formData();
	const image = await readImage(form.get('image'), 'image');
	const isLast = section.position === SECTION_COUNT;
	const overlap = isLast ? null : await readImage(form.get('overlap'), 'overlap');
	const contributorName = sanitizeName(form.get('name'));

	const imageKey = `corpses/${corpse.id}/section-${section.position}.${image.ext}`;
	if (await env.BUCKET.head(imageKey)) error(409, 'This section has already been drawn');

	await Promise.all([
		env.BUCKET.put(imageKey, image.bytes, { httpMetadata: { contentType: image.type } }),
		overlap &&
			env.BUCKET.put(overlapKey(imageKey), overlap.bytes, {
				httpMetadata: { contentType: overlap.type }
			})
	]);

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

	if (corpseComplete) {
		const settled = summon(env, corpse.id, {
			title: 'The corpse is complete',
			body: 'Three hands. One creature. Come and look.',
			url: `/c/${corpse.id}`
		}).catch((e) => console.error('push failed', e));
		if (ctx) ctx.waitUntil(settled);
		else await settled;
	}

	// Like the folded paper, the corpse passes from hand to hand.
	const next = sections.find((s) => s.position === section.position + 1);
	return json({
		corpseId: corpse.id,
		position: section.position,
		complete: corpseComplete,
		nextInvitePath: next ? `/draw/${next.invite_token}` : null
	});
};
