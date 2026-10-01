import { error, json } from '@sveltejs/kit';
import { SECTION_HEIGHT, SECTION_WIDTH, isUuid } from '$lib/constants';
import { getCorpse, isParticipant } from '$lib/server/repo';
import { getEnv, objectResponse, rateLimit, readImage } from '$lib/server/http';
import { assembleCorpse, assembledKey } from '$lib/server/assemble';
import type { RequestHandler } from './$types';

async function loadComplete(event: Parameters<RequestHandler>[0]) {
	const { id } = event.params;
	if (!isUuid(id)) error(404, 'No such corpse');
	const found = await getCorpse(getEnv(event).DB, id);
	if (!found || found.corpse.status !== 'complete') error(404, 'The corpse is not complete');
	return found;
}

function toBase64(bytes: ArrayBuffer): string {
	const view = new Uint8Array(bytes);
	let binary = '';
	for (let i = 0; i < view.length; i += 0x8000) {
		binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}

/**
 * Serves the assembled corpse: the stored WebP, assembling it first if needed.
 * If Images is unavailable and no browser has uploaded one yet, the sections
 * are stacked into an SVG on the fly.
 */
export const GET: RequestHandler = async (event) => {
	const { corpse, sections } = await loadComplete(event);
	const env = getEnv(event);
	const { BUCKET } = env;

	let stored = await BUCKET.get(assembledKey(corpse.id));
	if (
		!stored &&
		(await assembleCorpse(
			env,
			corpse.id,
			sections.map((s) => s.image_key)
		))
	) {
		stored = await BUCKET.get(assembledKey(corpse.id));
	}
	if (stored) return objectResponse(stored, true);

	const parts = await Promise.all(
		sections.map(async (s) => {
			const object = s.image_key ? await BUCKET.get(s.image_key) : null;
			if (!object) error(500, 'A section has gone missing');
			const type = object.httpMetadata?.contentType ?? 'image/webp';
			return `data:${type};base64,${toBase64(await object.arrayBuffer())}`;
		})
	);

	const height = SECTION_HEIGHT * parts.length;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SECTION_WIDTH}" height="${height}" viewBox="0 0 ${SECTION_WIDTH} ${height}">${parts
		.map(
			(href, i) =>
				`<image href="${href}" x="0" y="${i * SECTION_HEIGHT}" width="${SECTION_WIDTH}" height="${SECTION_HEIGHT}" preserveAspectRatio="none"/>`
		)
		.join('')}</svg>`;

	return new Response(svg, {
		headers: {
			'content-type': 'image/svg+xml',
			'cache-control': 'public, max-age=300',
			'content-security-policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'",
			'x-content-type-options': 'nosniff'
		}
	});
};

/** A participant's browser uploads the composited raster once, after the reveal. */
export const POST: RequestHandler = async (event) => {
	await rateLimit(event, 'assemble', 10);
	const { corpse, sections } = await loadComplete(event);
	if (!isParticipant(corpse, sections, event.locals.deviceId)) error(403, 'Not your corpse');

	const { BUCKET } = getEnv(event);
	const key = assembledKey(corpse.id);
	if (await BUCKET.head(key)) return json({ stored: false });

	const form = await event.request.formData();
	const image = await readImage(form.get('image'), 'image');
	await BUCKET.put(key, image.bytes, { httpMetadata: { contentType: image.type } });
	return json({ stored: true }, { status: 201 });
};
