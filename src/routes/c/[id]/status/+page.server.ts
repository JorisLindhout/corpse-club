import { error, redirect } from '@sveltejs/kit';
import { isUuid } from '$lib/constants';
import { getCorpse } from '$lib/server/repo';
import { getEnv } from '$lib/server/http';
import { corpseView } from '$lib/server/views';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { id } = event.params;
	if (!isUuid(id)) error(404, 'No such corpse');
	const found = await getCorpse(getEnv(event).DB, id);
	if (!found) error(404, 'No such corpse');
	if (found.corpse.status === 'complete') redirect(307, `/c/${id}`);

	return { corpse: corpseView(found, event.locals.deviceId) };
};
