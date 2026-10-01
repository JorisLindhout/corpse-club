// Local stand-in for a browser push service, for testing notifications end to end.
// Prints a subscription you can insert into the local D1 database, then decrypts
// and logs every push it receives. Usage: node scripts/push-sink.mjs [port]
import { createServer } from 'node:http';
import { createECDH, randomBytes } from 'node:crypto';
import ece from 'http_ece';

const port = Number(process.argv[2] ?? 8800);
const receiver = createECDH('prime256v1');
receiver.generateKeys();
const auth = randomBytes(16);

console.log(
	JSON.stringify({
		endpoint: `http://127.0.0.1:${port}/push`,
		p256dh: receiver.getPublicKey().toString('base64url'),
		auth: auth.toString('base64url')
	})
);

createServer((req, res) => {
	const chunks = [];
	req.on('data', (c) => chunks.push(c));
	req.on('end', () => {
		try {
			const body = ece.decrypt(Buffer.concat(chunks), {
				version: 'aes128gcm',
				privateKey: receiver,
				authSecret: auth
			});
			const vapid = req.headers.authorization?.startsWith('vapid t=') ? 'vapid' : 'no-vapid';
			console.log(`push [${vapid}] ${body.toString()}`);
		} catch (e) {
			console.log(`push could not be decrypted: ${e.message}`);
		}
		res.writeHead(201).end();
	});
}).listen(port, '127.0.0.1');
