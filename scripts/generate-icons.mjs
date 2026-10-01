// Renders the app icons into static/icons. Run with `npm run icons`.
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const BONE = '#f0ede6';
const BLOOD = '#b3001b';
const out = new URL('../static/icons/', import.meta.url);

const head = [
	'M62 44 C52 26 42 18 26 8',
	'M138 44 C148 26 158 18 174 8',
	'M60 50 C58 22 142 20 140 50 C143 72 132 86 120 91 L118 100',
	'M60 50 C57 72 68 86 82 91 L84 100',
	'M74 52 a8 9 0 1 0 16 0 a8 9 0 1 0 -16 0',
	'M110 52 a8 9 0 1 0 16 0 a8 9 0 1 0 -16 0',
	'M100 60 L96 70 L104 70 Z',
	'M84 79 L116 79 M90 75 L90 84 M97 75 L97 84 M104 75 L104 84 M111 75 L111 84'
];
const torso = [
	'M84 100 L80 114 C56 118 46 126 40 142 L22 186',
	'M118 100 L122 114 C146 118 156 126 160 142 L180 182',
	'M100 108 L100 200',
	'M100 124 C82 124 72 132 72 142 M100 124 C118 124 128 132 128 142',
	'M100 138 C84 138 76 146 76 154 M100 138 C116 138 124 146 124 154',
	'M72 142 C70 166 70 178 70 192 L66 200',
	'M128 142 C130 166 130 178 130 192 L134 200'
];
const legs = [
	'M66 200 C58 228 78 238 72 258 L60 288',
	'M134 200 C142 228 122 238 128 258 L140 288',
	'M60 288 L44 296 M60 288 L60 299 M60 288 L74 296',
	'M140 288 L126 296 M140 288 L140 299 M140 288 L156 296'
];

const rough = `<filter id="r"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="2.4"/></filter>`;
const paths = (list, width) =>
	list
		.map(
			(d) =>
				`<path d="${d}" fill="none" stroke="${BONE}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`
		)
		.join('');

/** Full three-part creature, scaled to `figure` of the canvas height. */
function creature({ size, figure, background = '#000', folds = true, stroke = 3 }) {
	const scale = (size * figure) / 300;
	const x = (size - 200 * scale) / 2;
	const y = (size - 300 * scale) / 2;
	const foldLines = folds
		? [100, 200]
				.map(
					(fy) =>
						`<line x1="-40" x2="240" y1="${fy}" y2="${fy}" stroke="${BLOOD}" stroke-width="${stroke * 0.6}" stroke-dasharray="5 6"/>`
				)
				.join('')
		: '';
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<defs>${rough}</defs>
${background ? `<rect width="100%" height="100%" fill="${background}"/>` : ''}
<g transform="translate(${x} ${y}) scale(${scale})">${foldLines}<g filter="url(#r)">${paths([...head, ...torso, ...legs], stroke)}</g></g>
</svg>`;
}

/** Just the skull, for tiny sizes. */
function skull({ size, background = '#000', stroke = 7 }) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="18 0 164 108">
${background ? `<rect x="18" y="0" width="164" height="108" fill="${background}"/>` : ''}
${paths(head, stroke)}
</svg>`;
}

await mkdir(out, { recursive: true });

const favicon = skull({ size: 64, stroke: 6 });
await writeFile(new URL('favicon.svg', out), favicon);

const render = (svg, name, size) =>
	sharp(Buffer.from(svg)).resize(size, size).png().toFile(new URL(name, out).pathname);

await render(creature({ size: 512, figure: 0.8 }), 'icon-512.png', 512);
await render(creature({ size: 512, figure: 0.8 }), 'icon-192.png', 192);
await render(creature({ size: 512, figure: 0.58 }), 'icon-maskable-512.png', 512);
await render(creature({ size: 512, figure: 0.72 }), 'apple-touch-icon.png', 180);
await render(skull({ size: 96, background: null, stroke: 8 }), 'badge-96.png', 96);

console.log('Icons written to static/icons');
