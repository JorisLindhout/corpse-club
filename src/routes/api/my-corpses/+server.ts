import { json } from '@sveltejs/kit';
import { myCorpses } from '$lib/server/repo';
import { getEnv } from '$lib/server/http';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const corpses = await myCorpses(getEnv(event).DB, event.locals.deviceId);
	return json({ corpses }, { headers: { 'cache-control': 'private, no-store' } });
};
