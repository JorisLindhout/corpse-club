import { MAX_UPLOAD_BYTES, OVERLAP_HEIGHT, SECTION_HEIGHT, SECTION_WIDTH } from './constants';

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

/** Bottom strip of a finished section, handed to the next hand. */
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

/** How much darker than the paper a pixel must be to count as ink. */
const INK_CONTRAST = 48;
/** Below this share of inked pixels, a strip reads as a bare edge. */
const MIN_INK_SHARE = 0.002;

function luminance(px: Uint8ClampedArray, i: number): number {
	return (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
}

/** Measured against the strip's own paper tone, so dim photos of blank paper stay blank. */
function hasInk(image: ImageData): boolean {
	const px = image.data;
	const pixels = px.length / 4;
	const histogram = new Uint32Array(256);
	for (let i = 0; i < px.length; i += 4) histogram[luminance(px, i)]++;
	let paper = 255;
	for (let v = 0, acc = 0; v < 256; v++) {
		acc += histogram[v];
		if (acc >= pixels * 0.6) {
			paper = v;
			break;
		}
	}
	let ink = 0;
	for (let v = 0; v < paper - INK_CONTRAST; v++) ink += histogram[v];
	return ink >= pixels * MIN_INK_SHARE;
}

/** Whether any lines reach the strip the next hand will see. */
export function overlapHasInk(section: HTMLCanvasElement): boolean {
	return hasInk(
		cropOverlap(section).getContext('2d')!.getImageData(0, 0, SECTION_WIDTH, OVERLAP_HEIGHT)
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
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	images.forEach((img, i) =>
		ctx.drawImage(img, 0, i * SECTION_HEIGHT, SECTION_WIDTH, SECTION_HEIGHT)
	);
	return canvas;
}

/**
 * Levels adjustment for photographed paper: pushes the paper tone to white and
 * the darkest ink to black, keeping colour.
 */
export function bleach(ctx: CanvasRenderingContext2D, width: number, height: number) {
	const image = ctx.getImageData(0, 0, width, height);
	const px = image.data;
	const histograms = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
	const step = Math.max(1, Math.floor(px.length / 4 / 40000)) * 4;
	let samples = 0;
	for (let i = 0; i < px.length; i += step) {
		histograms[0][px[i]]++;
		histograms[1][px[i + 1]]++;
		histograms[2][px[i + 2]]++;
		samples++;
	}
	const percentile = (histogram: Uint32Array, p: number) => {
		let acc = 0;
		for (let v = 0; v < 256; v++) {
			acc += histogram[v];
			if (acc >= samples * p) return v;
		}
		return 255;
	};

	// Per channel, so the paper also loses its colour cast. Paper dominates the
	// frame, so a mid-high percentile lands on its tone.
	const luts = histograms.map((histogram) => {
		const black = percentile(histogram, 0.01);
		const white = Math.max(black + 40, percentile(histogram, 0.6) - 6);
		const scale = 255 / (white - black);
		const lut = new Uint8ClampedArray(256);
		for (let v = 0; v < 256; v++) {
			lut[v] = Math.pow(Math.max(0, (v - black) * scale) / 255, 1.15) * 255;
		}
		return lut;
	});
	for (let i = 0; i < px.length; i += 4) {
		px[i] = luts[0][px[i]];
		px[i + 1] = luts[1][px[i + 1]];
		px[i + 2] = luts[2][px[i + 2]];
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
	for (let i = 0; i < px.length; i += 4) {
		const lum = (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
		const ink = Math.max(0, Math.min(255, (235 - lum) * 1.6));
		px[i] = rgb[0];
		px[i + 1] = rgb[1];
		px[i + 2] = rgb[2];
		px[i + 3] = ink;
	}
	ctx.putImageData(data, 0, 0);
	return canvas.toDataURL('image/png');
}
