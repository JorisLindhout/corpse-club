import { error, type RequestEvent } from '@sveltejs/kit';
import { MAX_NAME_LENGTH, MAX_UPLOAD_BYTES } from '../constants';
import { hitRateLimit } from './repo';

export function getEnv(event: Pick<RequestEvent, 'platform'>): Env {
	const env = event.platform?.env;
	if (!env?.DB || !env?.BUCKET) error(500, 'The ritual space is not bound');
	return env;
}

export async function rateLimit(
	event: RequestEvent,
	bucket: string,
	limit: number,
	windowSeconds = 60
): Promise<void> {
	const env = getEnv(event);
	let ip = 'unknown';
	try {
		ip = event.request.headers.get('cf-connecting-ip') ?? event.getClientAddress();
	} catch {
		// getClientAddress is unavailable in some local setups
	}
	const allowed = await hitRateLimit(env.DB, `${bucket}:${ip}`, limit, windowSeconds);
	if (!allowed) error(429, 'Too many hands at once. Wait a moment.');
}

const IMAGE_TYPES = {
	'image/webp': 'webp',
	'image/jpeg': 'jpg',
	'image/png': 'png'
} as const;

export type ImageType = keyof typeof IMAGE_TYPES;

function sniff(bytes: Uint8Array): ImageType | null {
	const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
	if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
		return 'image/jpeg';
	if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
	return null;
}

export interface ValidImage {
	bytes: ArrayBuffer;
	type: ImageType;
	ext: string;
}

/** Checks declared type, actual magic bytes and size. */
export async function readImage(
	value: FormDataEntryValue | null,
	field: string
): Promise<ValidImage> {
	if (!(value instanceof File)) error(400, `Missing ${field}`);
	if (value.size === 0 || value.size > MAX_UPLOAD_BYTES) error(413, `${field} is too large`);
	if (!(value.type in IMAGE_TYPES)) error(415, `${field} must be WebP, JPEG or PNG`);

	const bytes = await value.arrayBuffer();
	const type = sniff(new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength)));
	if (!type || type !== value.type) error(415, `${field} is not the image it claims to be`);

	return { bytes, type, ext: IMAGE_TYPES[type] };
}

export function sanitizeName(value: FormDataEntryValue | string | null | undefined): string | null {
	if (typeof value !== 'string') return null;
	const clean = value
		.normalize('NFC')
		// eslint-disable-next-line no-control-regex
		.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, MAX_NAME_LENGTH);
	return clean || null;
}

/** Streams an R2 object with sensible caching headers. */
export function objectResponse(object: R2ObjectBody, immutable: boolean): Response {
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('etag', object.httpEtag);
	headers.set('x-content-type-options', 'nosniff');
	headers.set(
		'cache-control',
		immutable ? 'public, max-age=31536000, immutable' : 'private, no-store'
	);
	return new Response(object.body, { headers });
}

export function overlapKey(imageKey: string): string {
	return imageKey.replace(/(\.\w+)$/, '-overlap$1');
}
