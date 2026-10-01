// Web Push (RFC 8030) with VAPID (RFC 8292) and aes128gcm payload
// encryption (RFC 8291), implemented on WebCrypto so it runs on Workers.

export interface PushTarget {
	endpoint: string;
	p256dh: string;
	auth: string;
}

export interface VapidKeys {
	publicKey: string;
	privateKey: string;
	subject: string;
}

const encoder = new TextEncoder();

export function b64urlEncode(input: ArrayBuffer | Uint8Array): string {
	const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(input: string): Uint8Array<ArrayBuffer> {
	const base64 = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

async function hkdf(
	salt: Uint8Array<ArrayBuffer>,
	ikm: Uint8Array<ArrayBuffer>,
	info: Uint8Array<ArrayBuffer>,
	length: number
): Promise<Uint8Array<ArrayBuffer>> {
	const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'HKDF', hash: 'SHA-256', salt, info },
		key,
		length * 8
	);
	return new Uint8Array(bits);
}

export async function vapidAuthorization(endpoint: string, keys: VapidKeys): Promise<string> {
	const header = b64urlEncode(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
	const claims = b64urlEncode(
		encoder.encode(
			JSON.stringify({
				aud: new URL(endpoint).origin,
				exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
				sub: keys.subject
			})
		)
	);

	const publicKey = b64urlDecode(keys.publicKey);
	const signingKey = await crypto.subtle.importKey(
		'jwk',
		{
			kty: 'EC',
			crv: 'P-256',
			d: keys.privateKey,
			x: b64urlEncode(publicKey.slice(1, 33)),
			y: b64urlEncode(publicKey.slice(33, 65))
		},
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign(
		{ name: 'ECDSA', hash: 'SHA-256' },
		signingKey,
		encoder.encode(`${header}.${claims}`)
	);

	return `vapid t=${header}.${claims}.${b64urlEncode(signature)}, k=${keys.publicKey}`;
}

/** Encrypts a payload for a subscription using the aes128gcm content encoding. */
export async function encryptPayload(
	payload: Uint8Array,
	target: Pick<PushTarget, 'p256dh' | 'auth'>
): Promise<Uint8Array<ArrayBuffer>> {
	const uaPublic = b64urlDecode(target.p256dh);
	const authSecret = b64urlDecode(target.auth);

	const uaKey = await crypto.subtle.importKey(
		'raw',
		uaPublic,
		{ name: 'ECDH', namedCurve: 'P-256' },
		false,
		[]
	);
	const local = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
		'deriveBits'
	])) as CryptoKeyPair;
	const asPublic = new Uint8Array(
		(await crypto.subtle.exportKey('raw', local.publicKey)) as ArrayBuffer
	);
	const sharedSecret = new Uint8Array(
		await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256)
	);

	const keyInfo = concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic);
	const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);

	const salt = crypto.getRandomValues(new Uint8Array(16));
	const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
	const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);

	const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
	// 0x02 delimits the final (and only) record.
	const plaintext = concat(payload, new Uint8Array([2]));
	const ciphertext = new Uint8Array(
		await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext)
	);

	const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
	header.set(salt, 0);
	new DataView(header.buffer).setUint32(16, 4096);
	header[20] = asPublic.length;
	header.set(asPublic, 21);

	return concat(header, ciphertext);
}

export interface PushResult {
	ok: boolean;
	status: number;
	/** The subscription no longer exists and should be deleted. */
	gone: boolean;
}

export async function sendWebPush(
	target: PushTarget,
	payload: unknown,
	keys: VapidKeys,
	ttlSeconds = 60 * 60 * 24
): Promise<PushResult> {
	const body = await encryptPayload(encoder.encode(JSON.stringify(payload)), target);
	const response = await fetch(target.endpoint, {
		method: 'POST',
		headers: {
			Authorization: await vapidAuthorization(target.endpoint, keys),
			'Content-Encoding': 'aes128gcm',
			'Content-Type': 'application/octet-stream',
			TTL: String(ttlSeconds),
			Urgency: 'normal'
		},
		body
	});
	return {
		ok: response.ok,
		status: response.status,
		gone: response.status === 404 || response.status === 410
	};
}
