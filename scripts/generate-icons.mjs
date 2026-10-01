// Renders the app icons into static/icons (and static/favicon.ico). Run with `npm run icons`.
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const BONE = '#f0ede6';
const BLOOD = '#b3001b';
const INK = '#000';
const out = new URL('../static/icons/', import.meta.url);

// A corpse-painted goat devil in a 200×300 box, folded into three parts.
// Paths are drawn with a deliberately unsteady hand (see `jitter`).
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
	'M100 100 L100 188',
	// spiked gauntlets
	'M100 114 L62 130 L42 116',
	'M60 124 L56 115 M54 126 L49 118 M66 132 L64 141',
	'M42 116 L33 108 M42 116 L31 119 M42 116 L37 126',
	'M100 114 L144 132 L160 120',
	'M146 126 L150 117 M152 129 L158 122 M139 134 L141 143',
	// trident
	'M173 106 L164 222',
	'M157 115 C156 127 187 130 188 118 M157 115 L155 103 M188 118 L191 106 M173 106 L174 94',
	{ d: 'M100 120 L100 156 M91 146 L109 146', color: BLOOD, w: 1.3 },
	'M100 188 L84 200 M100 188 L116 200'
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

function rng(seed) {
	let s = seed >>> 0;
	return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
}

/** Wobbles every coordinate, seeded so the drawing is the same on every run. */
function jitter(d, amount, seed) {
	const r = rng(seed);
	return d.replace(/-?\d+(\.\d+)?/g, (n) => (Number(n) + r() * amount).toFixed(1));
}

/** Each stroke is drawn twice, the second fainter and looser, like a sketch. */
function strokes(list, { width, wobble = 2.2, seed = 97, sketch = true }) {
	return list
		.map((item, i) => {
			const p = typeof item === 'string' ? { d: item } : item;
			const color = p.color ?? BONE;
			const w = (p.w ?? 1) * width;
			const main = `<path d="${jitter(p.d, wobble, seed + i * 31)}" fill="${p.fill ? color : 'none'}" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
			const ghost =
				sketch && !p.fill
					? `<path d="${jitter(p.d, wobble * 1.8, seed + i * 31 + 7)}" fill="none" stroke="${color}" stroke-opacity="0.45" stroke-width="${w * 0.6}" stroke-linecap="round"/>`
					: '';
			return main + ghost;
		})
		.join('');
}

const rough = `<filter id="r" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="3.2"/></filter>`;

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
<g transform="translate(${x} ${y}) scale(${scale})">${folds}<g filter="url(#r)">${strokes([...head, ...torso, ...legs], { width: 3.5 })}</g></g></svg>`;
}

/** Just the head, for small sizes: thicker lines, no sketch ghosting. */
function portrait({ size, background = '#000' }) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="40 -4 120 112">
${background ? `<rect x="40" y="-4" width="120" height="112" fill="${background}"/>` : ''}${strokes(head, { width: 7, sketch: false })}</svg>`;
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
