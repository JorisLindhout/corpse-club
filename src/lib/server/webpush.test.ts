/// <reference types="node" />
import { createECDH, randomBytes, createPublicKey, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
// @ts-expect-error untyped reference implementation
import ece from 'http_ece';
import { b64urlDecode, b64urlEncode, encryptPayload, vapidAuthorization } from './webpush';

describe('encryptPayload', () => {
	it('produces aes128gcm content the reference implementation can decrypt', async () => {
		const receiver = createECDH('prime256v1');
		receiver.generateKeys();
		const auth = randomBytes(16);
		const message = JSON.stringify({ title: 'The corpse is complete', url: '/c/abc' });

		const encrypted = await encryptPayload(new TextEncoder().encode(message), {
			p256dh: b64urlEncode(receiver.getPublicKey()),
			auth: b64urlEncode(auth)
		});

		const decrypted = ece.decrypt(Buffer.from(encrypted), {
			version: 'aes128gcm',
			privateKey: receiver,
			authSecret: auth
		});
		expect(decrypted.toString('utf8')).toBe(message);
	});
});

describe('vapidAuthorization', () => {
	it('signs an ES256 JWT verifiable with the public key', async () => {
		const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
			'sign',
			'verify'
		]);
		const publicKey = b64urlEncode(await crypto.subtle.exportKey('raw', pair.publicKey));
		const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey);

		const header = await vapidAuthorization('https://push.example.com/send/xyz', {
			publicKey,
			privateKey: d!,
			subject: 'mailto:test@example.com'
		});

		const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
		expect(match).not.toBeNull();
		const [, h, c, s, k] = match!;
		expect(k).toBe(publicKey);

		const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(c)));
		expect(claims.aud).toBe('https://push.example.com');
		expect(claims.sub).toBe('mailto:test@example.com');

		const raw = b64urlDecode(publicKey);
		const key = createPublicKey({
			key: {
				kty: 'EC',
				crv: 'P-256',
				x: b64urlEncode(raw.slice(1, 33)),
				y: b64urlEncode(raw.slice(33))
			},
			format: 'jwk'
		});
		const valid = verify(
			'sha256',
			Buffer.from(`${h}.${c}`),
			{ key, dsaEncoding: 'ieee-p1363' },
			Buffer.from(b64urlDecode(s))
		);
		expect(valid).toBe(true);
	});
});
