// Renders the app icons, iOS launch screens and share image into static/. Run with `npm run icons`.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { head, legs, torso } from '../src/lib/creature.js';

const BONE = '#f0ede6';
const BLOOD = '#b3001b';
const out = new URL('../static/icons/', import.meta.url);

function strokes(list, width) {
	return list
		.map(
			(d) =>
				`<path d="${d}" fill="none" stroke="${BONE}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`
		)
		.join('');
}

const rough = `<filter id="r" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="2.4"/></filter>`;

/**
 * The whole creature, scaled to `figure` of the canvas height. With `span`,
 * the fold lines run across the full canvas width.
 */
function creature({ width, height = width, figure, folds = BLOOD, span = false }) {
	const scale = (height * figure) / 300;
	const x = (width - 200 * scale) / 2;
	const y = (height - 300 * scale) / 2;
	const [x1, x2] = span ? [-x / scale, (width - x) / scale] : [-30, 230];
	const lines = [100, 200]
		.map(
			(fy) =>
				`<line x1="${x1}" x2="${x2}" y1="${fy}" y2="${fy}" stroke="${folds}" stroke-width="1.8" stroke-dasharray="5 6"/>`
		)
		.join('');
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>${rough}</defs><rect width="100%" height="100%" fill="#000"/>
<g transform="translate(${x} ${y}) scale(${scale})">${lines}<g filter="url(#r)">${strokes([...head, ...torso, ...legs], 3)}</g></g></svg>`;
}

/** Just the head, for small sizes. */
function portrait({ size, background = '#000' }) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="40 -4 120 112">
${background ? `<rect x="40" y="-4" width="120" height="112" fill="${background}"/>` : ''}${strokes(head, 6)}</svg>`;
}

/** ICO files may embed PNGs directly. */
function ico(pngs) {
	const header = Buffer.alloc(6 + 16 * pngs.length);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(pngs.length, 4);
	let offset = header.length;
	pngs.forEach(({ size, data }, i) => {
		const e = 6 + i * 16;
		header.writeUInt8(size % 256, e);
		header.writeUInt8(size % 256, e + 1);
		header.writeUInt16LE(1, e + 4);
		header.writeUInt16LE(32, e + 6);
		header.writeUInt32LE(data.length, e + 8);
		header.writeUInt32LE(offset, e + 12);
		offset += data.length;
	});
	return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

await mkdir(out, { recursive: true });

const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
const save = async (svg, name, size) => writeFile(new URL(name, out), await png(svg, size));

await writeFile(new URL('favicon.svg', out), portrait({ size: 64 }));
await writeFile(
	new URL('../favicon.ico', out),
	ico(
		await Promise.all(
			[16, 32, 48].map(async (size) => ({ size, data: await png(portrait({ size }), size) }))
		)
	)
);

await save(creature({ width: 512, figure: 0.86 }), 'icon-512.png', 512);
await save(creature({ width: 512, figure: 0.86 }), 'icon-192.png', 192);
// Maskable icons are cropped to a circle of 80% diameter.
await save(creature({ width: 512, figure: 0.6 }), 'icon-maskable-512.png', 512);
await save(creature({ width: 512, figure: 0.6 }), 'icon-maskable-192.png', 192);
await save(creature({ width: 512, figure: 0.78 }), 'apple-touch-icon.png', 180);

/**
 * Android badges and themed (monochrome) icons use only the alpha channel,
 * so the bone lines become opaque and the black background transparent.
 */
async function alpha(svg, size, name) {
	const grey = await sharp(Buffer.from(svg)).resize(size, size).greyscale().raw().toBuffer();
	const rgba = Buffer.alloc(size * size * 4);
	for (let i = 0; i < grey.length; i++) {
		rgba.fill(255, i * 4, i * 4 + 3);
		rgba[i * 4 + 3] = grey[i];
	}
	await sharp(rgba, { raw: { width: size, height: size, channels: 4 } })
		.png()
		.toFile(new URL(name, out).pathname);
}

await alpha(portrait({ size: 96 }), 96, 'badge-96.png');
await alpha(creature({ width: 512, figure: 0.6, folds: BONE }), 512, 'icon-monochrome-512.png');

// iOS shows these launch screens instead of a white flash; see src/lib/splash.json.
const splash = new URL('../static/splash/', import.meta.url);
await mkdir(splash, { recursive: true });
const devices = JSON.parse(await readFile(new URL('../src/lib/splash.json', import.meta.url)));
await Promise.all(
	devices.map(async ({ width, height, ratio }) => {
		const [w, h] = [width * ratio, height * ratio];
		await sharp(Buffer.from(creature({ width: w, height: h, figure: 0.4, span: true })))
			.png({ palette: true, compressionLevel: 9 })
			.toFile(new URL(`${w}x${h}.png`, splash).pathname);
	})
);

await sharp(Buffer.from(creature({ width: 1200, height: 630, figure: 0.86, span: true })))
	.png({ palette: true, compressionLevel: 9 })
	.toFile(new URL('../static/og.png', import.meta.url).pathname);

console.log('Icons written to static/icons, static/splash, static/og.png and static/favicon.ico');
