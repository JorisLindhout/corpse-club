import { json } from '@sveltejs/kit';
import { createCorpse } from '$lib/server/repo';
import { getEnv, rateLimit, readSection, sectionKey, storeSection } from '$lib/server/http';
import type { RequestHandler } from './$types';

/** Seals the head of a new corpse, bringing the corpse into being. */
export const POST: RequestHandler = async (event) => {
	await rateLimit(event, 'create', 10);
	const env = getEnv(event);
	const upload = await readSection(event.request, false);

	const corpseId = crypto.randomUUID();
	const imageKey = sectionKey(corpseId, 1, upload.image);
	await storeSection(env.BUCKET, imageKey, upload);

	const { nextToken } = await createCorpse(env.DB, {
		corpseId,
		imageKey,
		contributorName: upload.contributorName,
		deviceId: event.locals.deviceId
	});

	return json(
		{ corpseId, position: 1, complete: false, nextInvitePath: `/draw/${nextToken}` },
		{ status: 201 }
	);
};
