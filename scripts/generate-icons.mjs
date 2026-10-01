// Renders the app icons into static/icons (and static/favicon.ico). Run with `npm run icons`.
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const BONE = '#f0ede6';
const BLOOD = '#b3001b';
const INK = '#000';
const out = new URL('../static/icons/', import.meta.url);

// A corpse-painted goat devil in a 200×300 box, folded into three parts.
const head = [
	{ d: 'M74 36 C68 20 66 8 74 -2 C76 10 82 24 88 32 Z', fill: true },
	{ d: 'M126 36 C132 20 136 10 130 0 C126 12 120 24 112 32 Z', fill: true },
	'M70 14 L76 16 M70 22 L78 24 M130 14 L124 16 M131 22 L123 24',
	{ d: 'M67 44 C63 25 137 25 133 45 C136 67 120 85 100 91 C79 85 64 66 67 44 Z', fill: true },
	{ d: 'M73 45 L93 49 L90 65 L83 73 L76 60 Z', fill: true, color: INK },
	{ d: 'M127 47 L108 50 L111 62 L117 68 L124 58 Z', fill: true, color: INK },
	{ d: 'M100 58 L96 68 L104 67 Z', fill: true, color: INK },
	{ d: 'M82 80 C92 75 108 76 118 78 L113 87 L101 82 L87 86 Z', fill: true, color: INK },
	{ d: 'M89 79 L91 86 M111 78 L109 86', color: INK, w: 0.8 },
	'M67 48 L49 53 L66 59',
	'M133 48 L152 55 L134 60',
	{ d: 'M91 88 L95 103 L100 96 L104 104 L109 88 Z', fill: true }
];
const torso = [
	'M92 100 L88 110 C68 112 56 120 50 134 L40 160 L32 182',
	'M32 182 L21 186 M32 182 L28 194 M32 182 L39 191',
	'M108 100 L112 110 C132 112 144 120 150 134 L160 160 L168 182',
	'M168 182 L179 186 M168 182 L172 194 M168 182 L161 191',
	'M74 134 C70 160 76 180 82 200',
	'M126 134 C128 160 124 180 118 200'
];
const legs = [
	// goat legs: knees bend back, cloven hooves
	'M84 200 C62 212 58 238 74 250 L64 284',
	'M98 204 C86 218 82 234 90 248 L78 284',
	'M116 200 C142 214 146 240 128 252 L138 284',
	'M102 204 C116 220 120 236 112 250 L124 284',
	'M64 220 L56 224 L62 228 L54 232 L61 236',
	'M140 222 L148 226 L142 230 L150 234 L143 238',
	{ d: 'M57 284 L82 284 L80 297 L72 291 L67 297 L56 297 Z', fill: true },
	{ d: 'M119 284 L143 284 L145 297 L134 297 L129 291 L121 297 Z', fill: true },
	'M101 204 C128 220 156 210 162 234 C166 250 174 252 180 244',
	{ d: 'M180 244 L169 241 L186 233 L185 251 Z', fill: true }
];

function strokes(list, width) {
	return list
		.map((item) => {
			const p = typeof item === 'string' ? { d: item } : item;
			const color = p.color ?? BONE;
			return `<path d="${p.d}" fill="${p.fill ? color : 'none'}" stroke="${color}" stroke-width="${(p.w ?? 1) * width}" stroke-linecap="round" stroke-linejoin="round"/>`;
		})
		.join('');
}

const rough = `<filter id="r" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="2.4"/></filter>`;

/** The whole creature, scaled to `figure` of the canvas height. */
function creature({ size, figure }) {
	const scale = (size * figure) / 300;
	const x = (size - 200 * scale) / 2;
	const y = (size - 300 * scale) / 2;
	const folds = [100, 200]
		.map(
			(fy) =>
				`<line x1="-30" x2="230" y1="${fy}" y2="${fy}" stroke="${BLOOD}" stroke-width="1.8" stroke-dasharray="5 6"/>`
		)
		.join('');
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<defs>${rough}</defs><rect width="100%" height="100%" fill="#000"/>
<g transform="translate(${x} ${y}) scale(${scale})">${folds}<g filter="url(#r)">${strokes([...head, ...torso, ...legs], 3)}</g></g></svg>`;
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

await save(creature({ size: 512, figure: 0.86 }), 'icon-512.png', 512);
await save(creature({ size: 512, figure: 0.86 }), 'icon-192.png', 192);
// Maskable icons are cropped to a circle of 80% diameter.
await save(creature({ size: 512, figure: 0.6 }), 'icon-maskable-512.png', 512);
await save(creature({ size: 512, figure: 0.78 }), 'apple-touch-icon.png', 180);

// Android notification badges use only the alpha channel: bone becomes
// opaque, the painted features become holes.
const badge = await sharp(Buffer.from(portrait({ size: 96 })))
	.resize(96, 96)
	.greyscale()
	.raw()
	.toBuffer();
const rgba = Buffer.alloc(96 * 96 * 4);
for (let i = 0; i < badge.length; i++) {
	rgba.fill(255, i * 4, i * 4 + 3);
	rgba[i * 4 + 3] = badge[i];
}
await sharp(rgba, { raw: { width: 96, height: 96, channels: 4 } })
	.png()
	.toFile(new URL('badge-96.png', out).pathname);

console.log('Icons written to static/icons and static/favicon.ico');
