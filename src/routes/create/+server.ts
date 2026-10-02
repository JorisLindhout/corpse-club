import { redirect } from '@sveltejs/kit';
import { NEW_CORPSE } from '$lib/constants';
import type { RequestHandler } from './$types';

/** Summoning no longer creates anything; old links and forms land on the head instead. */
const summon: RequestHandler = () => redirect(303, `/draw/${NEW_CORPSE}`);

export const GET = summon;
export const POST = summon;
