import { json } from '@sveltejs/kit';
import { createCorpse } from '$lib/server/repo';
import { getEnv, rateLimit } from '$lib/server/http';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	await rateLimit(event, 'create', 10);
	const { corpseId, token } = await createCorpse(getEnv(event).DB, event.locals.deviceId);
	return json({ corpseId, drawUrl: `/draw/${token}` }, { status: 201 });
};
