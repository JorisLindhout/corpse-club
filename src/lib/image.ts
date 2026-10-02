import {
	MAX_UPLOAD_BYTES,
	OVERLAP_HEIGHT,
	PAPER,
	SECTION_HEIGHT,
	SECTION_WIDTH
} from './constants';
import { GRAPHITE } from './pencil';

function hexRgb(hex: string): [number, number, number] {
	const n = parseInt(hex.slice(1), 16);
	return [n >> 16, (n >> 8) & 255, n & 255];
}

export function createCanvas(width: number, height: number): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
	return new Promise((resolve, reject) =>
		canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encoding failed'))), type, quality)
	);
}

/**
 * Encodes as WebP where the browser can (Safari cannot), falling back to
 * JPEG, stepping quality down until it fits the upload limit.
 */
export async function encodeCanvas(canvas: HTMLCanvasElement, quality = 0.86): Promise<Blob> {
	let q = quality;
	for (;;) {
		let blob = await toBlob(canvas, 'image/webp', q);
		if (blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', q);
		if (blob.size <= MAX_UPLOAD_BYTES * 0.95 || q < 0.3) return blob;
		q -= 0.12;
	}
}

/** Bottom strip of a finished section, passed to the next acolyte. */
export function cropOverlap(section: HTMLCanvasElement): HTMLCanvasElement {
	const strip = createCanvas(SECTION_WIDTH, OVERLAP_HEIGHT);
	strip
		.getContext('2d')!
		.drawImage(
			section,
			0,
			section.height - OVERLAP_HEIGHT,
			SECTION_WIDTH,
			OVERLAP_HEIGHT,
			0,
			0,
			SECTION_WIDTH,
			OVERLAP_HEIGHT
		);
	return strip;
}

export interface InkSensitivity {
	/** How much darker than the paper a pixel must be to count as ink. */
	contrast: number;
	/** Below this share of inked pixels, a strip reads as a bare edge. */
	share: number;
}

const PHOTO_INK: InkSensitivity = { contrast: 48, share: 0.002 };

function luminance(px: Uint8ClampedArray, i: number): number {
	return (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
}

function luminanceHistogram(px: Uint8ClampedArray): Uint32Array {
	const histogram = new Uint32Array(256);
	for (let i = 0; i < px.length; i += 4) histogram[luminance(px, i)]++;
	return histogram;
}

/** Paper fills most of a strip, so a mid-high percentile lands on its tone. */
function paperTone(histogram: Uint32Array, pixels: number): number {
	for (let v = 0, acc = 0; v < 256; v++) {
		acc += histogram[v];
		if (acc >= pixels * 0.6) return v;
	}
	return 255;
}

/** Measured against the strip's own paper tone, so dim photos of blank paper stay blank. */
function hasInk(image: ImageData, { contrast, share }: InkSensitivity = PHOTO_INK): boolean {
	const pixels = image.data.length / 4;
	const histogram = luminanceHistogram(image.data);
	const paper = paperTone(histogram, pixels);
	let ink = 0;
	for (let v = 0; v < paper - contrast; v++) ink += histogram[v];
	return ink >= pixels * share;
}

/** Whether any lines reach the strip the next acolyte will see. */
export function overlapHasInk(
	section: HTMLCanvasElement,
	sensitivity: InkSensitivity = PHOTO_INK
): boolean {
	return hasInk(
		cropOverlap(section).getContext('2d')!.getImageData(0, 0, SECTION_WIDTH, OVERLAP_HEIGHT),
		sensitivity
	);
}

/** Whether a received strip holds any lines to continue. */
export async function stripHasInk(src: string): Promise<boolean> {
	const img = await loadImage(src);
	const canvas = createCanvas(img.naturalWidth, img.naturalHeight);
	const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
	ctx.drawImage(img, 0, 0);
	return hasInk(ctx.getImageData(0, 0, canvas.width, canvas.height));
}

export function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.decoding = 'async';
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error(`Could not load ${src}`));
		img.src = src;
	});
}

/** Stacks section images top to bottom into one canvas. */
export async function assemble(sources: string[]): Promise<HTMLCanvasElement> {
	const images = await Promise.all(sources.map(loadImage));
	const canvas = createCanvas(SECTION_WIDTH, SECTION_HEIGHT * images.length);
	const ctx = canvas.getContext('2d')!;
	ctx.fillStyle = PAPER;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	images.forEach((img, i) =>
		ctx.drawImage(img, 0, i * SECTION_HEIGHT, SECTION_WIDTH, SECTION_HEIGHT)
	);
	return canvas;
}

/** The ink slider runs from faint lines lightened (0) to the darkest at screen graphite (1). */
export const DEFAULT_INK = 0.5;

const PAPER_RGB = hexRgb(PAPER);
/** The darkest screen graphite, as a share of the paper's tone. */
const GRAPHITE_TONE = hexRgb(GRAPHITE)[1] / PAPER_RGB[1];
/** Tones within this share of the paper are its grain, and roll off to paper. */
const PAPER_KNEE = 0.93;
const KNEE_SOFTNESS = 0.08;
/** Ink is never stretched further than this tone needs, so blank paper's grain stays grain. */
const FAINTEST_INK = 0.6;
/** Cells across the longer side when measuring the paper under uneven light. */
const PAPER_GRID = 24;
const TONE_STEPS = 1024;
const MAX_TONE = 1.25;

function rollOffToPaper(tone: number): number {
	const u = tone / PAPER_KNEE;
	if (u <= 1 - KNEE_SOFTNESS) return u;
	if (u >= 1 + KNEE_SOFTNESS) return 1;
	return u - (u - 1 + KNEE_SOFTNESS) ** 2 / (4 * KNEE_SOFTNESS);
}

/**
 * Tone curve for one channel, from its tone as a share of the paper around it
 * to the share of the app's paper colour it keeps. `darkest` is the photo's
 * darkest ink tone; `ink` (0 to 1) pushes it toward graphite and weighs
 * the fainter lines down with it.
 */
export function inkCurve(ink: number, darkest: number): (tone: number) => number {
	const gamma = 0.7 + ink;
	const from = rollOffToPaper(Math.min(darkest, FAINTEST_INK));
	const to = (from + (GRAPHITE_TONE - from) * ink) ** (1 / gamma);
	const black = from > to ? (from - to) / (1 - to) : 0;
	return (tone) => Math.max(0, (rollOffToPaper(tone) - black) / (1 - black)) ** gamma;
}

/** Spreads cell values to their neighbours, with edges repeated. */
function blurGrid(grid: Float32Array, cols: number, rows: number) {
	const tmp = new Float32Array(grid.length);
	for (let pass = 0; pass < 2; pass++) {
		for (let y = 0; y < rows; y++) {
			for (let x = 0; x < cols; x++) {
				const row = y * cols;
				tmp[row + x] =
					(grid[row + Math.max(0, x - 1)] +
						2 * grid[row + x] +
						grid[row + Math.min(cols - 1, x + 1)]) /
					4;
			}
		}
		for (let y = 0; y < rows; y++) {
			for (let x = 0; x < cols; x++) {
				grid[y * cols + x] =
					(tmp[Math.max(0, y - 1) * cols + x] +
						2 * tmp[y * cols + x] +
						tmp[Math.min(rows - 1, y + 1) * cols + x]) /
					4;
			}
		}
	}
}

interface PaperField {
	cell: number;
	cols: number;
	rows: number;
	/** Paper colour per cell, as interleaved RGB. */
	rgb: Float32Array;
}

/**
 * The paper's colour across the photo, smooth enough to follow shadows and
 * lamp falloff but not the lines. Transparent pixels, outside the photo, are
 * left out.
 */
function paperField(px: Uint8ClampedArray, width: number, height: number): PaperField {
	const cell = Math.ceil(Math.max(width, height) / PAPER_GRID);
	const cols = Math.ceil(width / cell);
	const rows = Math.ceil(height / cell);
	const stride = Math.max(1, Math.floor(cell / 16));
	const perSide = Math.ceil(cell / stride);
	const samples = new Uint32Array(perSide * perSide);
	const histogram = new Uint32Array(256);
	const channels = [0, 1, 2].map(() => new Float32Array(cols * rows));
	const tones = new Float32Array(cols * rows);
	const weights = new Float32Array(cols * rows);

	for (let cy = 0; cy < rows; cy++) {
		for (let cx = 0; cx < cols; cx++) {
			histogram.fill(0);
			let count = 0;
			for (let y = cy * cell; y < Math.min(height, (cy + 1) * cell); y += stride) {
				for (let x = cx * cell; x < Math.min(width, (cx + 1) * cell); x += stride) {
					const i = (y * width + x) * 4;
					if (px[i + 3] < 255) continue;
					samples[count++] = i;
					histogram[luminance(px, i)]++;
				}
			}
			if (count < (perSide * perSide) / 4) continue;
			// Lines rarely cover most of a cell, so its brightest pixels are paper.
			let threshold = 255;
			for (let v = 255, acc = 0; v >= 0; v--) {
				acc += histogram[v];
				if (acc >= count * 0.15) {
					threshold = v;
					break;
				}
			}
			const sum = [0, 0, 0];
			let n = 0;
			for (let s = 0; s < count; s++) {
				const i = samples[s];
				if (luminance(px, i) < threshold) continue;
				sum[0] += px[i];
				sum[1] += px[i + 1];
				sum[2] += px[i + 2];
				n++;
			}
			const c = cy * cols + cx;
			for (let k = 0; k < 3; k++) channels[k][c] = sum[k] / n;
			tones[c] = (sum[0] * 77 + sum[1] * 150 + sum[2] * 29) / 256 / n;
			weights[c] = count / (perSide * perSide);
		}
	}

	const measured = [...tones].filter((_, c) => weights[c] > 0).sort((a, b) => a - b);
	const rgb = new Float32Array(cols * rows * 3);
	if (!measured.length) {
		for (let c = 0; c < cols * rows; c++) rgb.set([255, 255, 255], c * 3);
		return { cell, cols, rows, rgb };
	}
	// A cell far darker than the page is a filled-in shape, not shadowed paper.
	const page = measured[Math.floor((measured.length - 1) * 0.75)];
	const fallback = [0, 0, 0];
	let total = 0;
	for (let c = 0; c < cols * rows; c++) {
		weights[c] *= Math.min(1, Math.max(0, (tones[c] / page - 0.5) / 0.3));
		for (let k = 0; k < 3; k++) {
			fallback[k] += channels[k][c] * weights[c];
			channels[k][c] *= weights[c];
		}
		total += weights[c];
	}
	for (const grid of [...channels, weights]) blurGrid(grid, cols, rows);
	for (let c = 0; c < cols * rows; c++) {
		for (let k = 0; k < 3; k++) {
			rgb[c * 3 + k] = Math.max(
				8,
				weights[c] > 1e-4 ? channels[k][c] / weights[c] : fallback[k] / total
			);
		}
	}
	return { cell, cols, rows, rgb };
}

/** Bilinear lookup positions for one axis, between cell centres. */
function axis(length: number, cell: number, cells: number) {
	const lo = new Int32Array(length);
	const hi = new Int32Array(length);
	const t = new Float32Array(length);
	for (let p = 0; p < length; p++) {
		const pos = Math.min(cells - 1, Math.max(0, (p + 0.5) / cell - 0.5));
		lo[p] = Math.floor(pos);
		hi[p] = Math.min(cells - 1, lo[p] + 1);
		t[p] = pos - lo[p];
	}
	return { lo, hi, t };
}

/** The paper colour under every pixel of row `y`, as interleaved RGB. */
function paperRow(
	field: PaperField,
	xs: ReturnType<typeof axis>,
	ys: ReturnType<typeof axis>,
	y: number,
	out: Float32Array
) {
	const { cols, rgb } = field;
	const top = ys.lo[y] * cols;
	const bottom = ys.hi[y] * cols;
	const v = ys.t[y];
	for (let x = 0; x < xs.lo.length; x++) {
		const u = xs.t[x];
		for (let k = 0; k < 3; k++) {
			const a = rgb[(top + xs.lo[x]) * 3 + k];
			const b = rgb[(top + xs.hi[x]) * 3 + k];
			const c = rgb[(bottom + xs.lo[x]) * 3 + k];
			const d = rgb[(bottom + xs.hi[x]) * 3 + k];
			out[x * 3 + k] = (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
		}
	}
}

/**
 * Turns a photo of a drawing into lines on the app's paper. Each pixel is
 * divided by the paper around it, which evens out shadows and removes colour
 * casts at once; `ink` (0 to 1) then sets how dark the lines get. Transparent
 * pixels, outside the photo, become paper.
 */
export function developPhoto(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	ink: number
) {
	const image = ctx.getImageData(0, 0, width, height);
	const px = image.data;
	const field = paperField(px, width, height);
	const xs = axis(width, field.cell, field.cols);
	const ys = axis(height, field.cell, field.rows);
	const paper = new Float32Array(width * 3);

	const histogram = new Uint32Array(256);
	let samples = 0;
	const xStep = Math.max(1, Math.floor(width / 200));
	for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 200))) {
		paperRow(field, xs, ys, y, paper);
		for (let x = 0; x < width; x += xStep) {
			const i = (y * width + x) * 4;
			if (px[i + 3] < 255) continue;
			const p = x * 3;
			const tone =
				(77 * px[i]) / paper[p] +
				(150 * px[i + 1]) / paper[p + 1] +
				(29 * px[i + 2]) / paper[p + 2];
			histogram[Math.min(255, Math.round(tone))]++;
			samples++;
		}
	}
	let darkest = 1;
	for (let v = 0, acc = 0; v < 256; v++) {
		acc += histogram[v];
		if (acc >= samples * 0.003) {
			darkest = v / 255;
			break;
		}
	}

	const curve = inkCurve(ink, darkest);
	const lut = new Float32Array(TONE_STEPS);
	for (let s = 0; s < TONE_STEPS; s++) lut[s] = curve((s / (TONE_STEPS - 1)) * MAX_TONE);
	const scale = (TONE_STEPS - 1) / MAX_TONE;

	for (let y = 0; y < height; y++) {
		paperRow(field, xs, ys, y, paper);
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			const alpha = px[i + 3] / 255;
			for (let k = 0; k < 3; k++) {
				const step = Math.min(TONE_STEPS - 1, Math.round((px[i + k] / paper[x * 3 + k]) * scale));
				px[i + k] = PAPER_RGB[k] * (1 - alpha * (1 - lut[step]));
			}
			px[i + 3] = 255;
		}
	}
	ctx.putImageData(image, 0, 0);
}

/**
 * Turns an overlap strip (dark ink on pale paper) into a transparent overlay
 * where only the ink remains, tinted for visibility over a camera feed.
 */
export async function inkOverlay(src: string, rgb: [number, number, number]): Promise<string> {
	const img = await loadImage(src);
	const canvas = createCanvas(img.naturalWidth, img.naturalHeight);
	const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
	ctx.drawImage(img, 0, 0);
	const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
	const px = data.data;
	const faintest = paperTone(luminanceHistogram(px), px.length / 4) - 20;
	for (let i = 0; i < px.length; i += 4) {
		const ink = Math.max(0, Math.min(255, (faintest - luminance(px, i)) * 1.6));
		px[i] = rgb[0];
		px[i + 1] = rgb[1];
		px[i + 2] = rgb[2];
		px[i + 3] = ink;
	}
	ctx.putImageData(data, 0, 0);
	return canvas.toDataURL('image/png');
}
