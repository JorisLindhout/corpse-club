import { SECTION_HEIGHT, SECTION_WIDTH } from '../constants';

export const assembledKey = (id: string) => `corpses/${id}/assembled`;

function stream(bytes: ArrayBuffer): ReadableStream<Uint8Array> {
	return new Blob([bytes]).stream();
}

/**
 * Stacks the sections into one WebP with the Images binding and stores it.
 * Returns false when that fails (offline dev only resizes, and the free plan
 * stops at 5,000 transformations a month); browsers then upload their own.
 */
export async function assembleCorpse(
	env: Pick<Env, 'BUCKET' | 'IMAGES'>,
	corpseId: string,
	imageKeys: (string | null)[]
): Promise<boolean> {
	const key = assembledKey(corpseId);
	if (await env.BUCKET.head(key)) return true;

	const objects = await Promise.all(imageKeys.map((k) => (k ? env.BUCKET.get(k) : null)));
	if (objects.some((o) => !o)) return false;
	const parts = await Promise.all(objects.map((o) => o!.arrayBuffer()));

	try {
		// The output takes the base image's size, so the head is padded to full
		// height first; the drawn sections then cover every pixel of it.
		let canvas = env.IMAGES.input(stream(parts[0])).transform({
			width: SECTION_WIDTH,
			height: SECTION_HEIGHT * parts.length,
			fit: 'pad',
			background: '#FFFFFF'
		});
		parts.forEach((bytes, i) => {
			const section = env.IMAGES.input(stream(bytes)).transform({
				width: SECTION_WIDTH,
				height: SECTION_HEIGHT,
				fit: 'cover'
			});
			canvas = canvas.draw(section, { top: i * SECTION_HEIGHT, left: 0 });
		});

		const result = await canvas.output({ format: 'image/webp', quality: 85 });
		const image = await result.response().arrayBuffer();
		await env.BUCKET.put(key, image, { httpMetadata: { contentType: result.contentType() } });
		return true;
	} catch (e) {
		console.warn('assembling with Images failed', e);
		return false;
	}
}
