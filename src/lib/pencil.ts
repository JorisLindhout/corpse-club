/**
 * A pencil that only does what the hand does: the line runs straight between
 * the sampled positions, speed thins and lightens it, pressure darkens and
 * firms it, the tip's shape follows the stylus's tilt or the direction of
 * travel, and graphite builds up where lines cross. No texture, jitter or
 * tapering is added.
 */

export const PAPER = '#ffffff';
/** The darkest graphite gets, however often a spot is gone over. */
export const GRAPHITE = '#262626';

export interface Tip {
	/** Line width in canvas units when drawn slowly. */
	width: number;
	erase: boolean;
}

export interface Point {
	x: number;
	y: number;
	/** Narrow side of the tip, in canvas units. */
	width: number;
	/** Long side of the tip over its narrow side; 1 is round. */
	stretch: number;
	/** Direction of the tip's long side, in radians. */
	angle: number;
	/** How much graphite one pass leaves here, 0 to 1. */
	alpha: number;
}

export interface Stroke {
	erase: boolean;
	points: Point[];
}

export interface Sample {
	/** Position in canvas units. */
	x: number;
	y: number;
	/** Position in CSS pixels, so speed measures the hand regardless of zoom. */
	screenX: number;
	screenY: number;
	/** Milliseconds. */
	t: number;
	pressure: number;
	/** Contact size in CSS pixels, or 0 when the device does not report it. */
	contact: number;
	/** Stylus angle from the screen in radians; π/2 is upright. */
	altitude: number;
	/** Direction the stylus leans, in radians. */
	azimuth: number;
	kind: string;
}

/** Hand speed, in CSS pixels per millisecond, at which a line is thinnest and lightest. */
const FAST = 2.5;
/** Share of the tip width left at full speed. */
const THINNEST = 0.55;
/** Speed is measured over this many milliseconds, so timer noise does not shake the width. */
const SPEED_WINDOW = 40;
/** Graphite left by the lightest touch. */
const LIGHTEST = 0.06;
/** Graphite left by one pass at full pressure; going over it again gets darker. */
const HEAVIEST = 0.85;
/** Finger pressure when the device reports no usable contact size. */
const FINGER_PRESSURE = 0.8;
/** Share of graphite a finger loses at full speed. */
const FINGER_SPEED_LIGHTENS = 0.6;
/** Share of graphite a stylus loses at full speed; its pressure already says most. */
const PEN_SPEED_LIGHTENS = 0.35;
/** Contact growth over the resting size that counts as full pressure. */
const CONTACT_RANGE = 0.6;
/** Samples closer than this to the previous point add to it instead of starting a new one. */
const MIN_STEP = 0.2;
/**
 * A finger or mouse draws with a worn, flattish lead held at a fixed angle,
 * so the line is broad going down and narrow going sideways.
 */
const CHISEL = { angle: -Math.PI / 8, narrow: 0.75, long: 1.15 };
/** How far a tilted stylus lengthens its tip, laying the lead on its side. */
const TILT_STRETCH = 1.2;
/** Edge hardness from the lightest to the heaviest touch; 1 is a crisp edge. */
const SOFTEST = 0.2;
const HARDEST = 0.9;
const ERASER_HARDNESS = 0.6;

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/** 0 when still, 1 at full speed, rising quickly at first like the hand's own effort. */
export function speedEase(speed: number): number {
	const s = clamp(speed / FAST, 0, 1);
	return s * (2 - s);
}

export function widthFor(tip: Tip, speed: number): number {
	return tip.width * (1 - (1 - THINNEST) * speedEase(speed));
}

export function darkness(pressure: number): number {
	return LIGHTEST + (HEAVIEST - LIGHTEST) * clamp(pressure, 0, 1);
}

/** Light touches leave a soft, airy edge; heavy ones a firm edge. */
export function hardnessFor(alpha: number): number {
	return SOFTEST + (HARDEST - SOFTEST) * clamp((alpha - LIGHTEST) / (HEAVIEST - LIGHTEST), 0, 1);
}

/** Converts pointer tilt in degrees to altitude and azimuth in radians. */
export function tiltAngles(tiltX: number, tiltY: number): { altitude: number; azimuth: number } {
	const x = Math.tan((tiltX * Math.PI) / 180);
	const y = Math.tan((tiltY * Math.PI) / 180);
	return { altitude: Math.atan2(1, Math.hypot(x, y)), azimuth: Math.atan2(y, x) };
}

/** Finger contact sizes seen so far; the resting size drifts slowly upward and drops at once. */
const contactSeen = { low: 0, high: 0 };

/** How much harder than resting a finger presses, or null when contact size tells nothing. */
export function contactPressure(contact: number): number | null {
	if (contact <= 1) return null;
	if (!contactSeen.low || contact < contactSeen.low) contactSeen.low = contact;
	else contactSeen.low += (contact - contactSeen.low) * 0.001;
	contactSeen.high = Math.max(contactSeen.high, contact);
	// A device that reports one fixed size has no pressure to give.
	if (contactSeen.high < contactSeen.low * 1.15) return null;
	return clamp((contact / contactSeen.low - 1) / CONTACT_RANGE, 0, 1);
}

/** Turns samples of one stroke into points with tip shape and graphite. */
export class Dynamics {
	private recent: { x: number; y: number; t: number }[] = [];

	constructor(private tip: Tip) {}

	point(sample: Sample): Point {
		const speed = this.speed(sample);
		const ease = speedEase(speed);
		let width = widthFor(this.tip, speed);
		let stretch = 1;
		let angle = 0;
		let pressure: number;
		if (sample.kind === 'pen') {
			pressure = sample.pressure * (1 - PEN_SPEED_LIGHTENS * ease);
			const tilt = clamp((Math.PI / 2 - sample.altitude) / (Math.PI / 3), 0, 1);
			stretch = 1 + TILT_STRETCH * tilt * tilt;
			angle = sample.azimuth;
		} else {
			const press = sample.kind === 'touch' ? contactPressure(sample.contact) : null;
			const base = press === null ? FINGER_PRESSURE : 0.6 + 0.4 * press;
			pressure = base * (1 - FINGER_SPEED_LIGHTENS * ease);
			width *= CHISEL.narrow;
			stretch = CHISEL.long / CHISEL.narrow;
			angle = CHISEL.angle;
		}
		if (this.tip.erase) {
			width *= Math.sqrt(stretch);
			stretch = 1;
		}
		const alpha = this.tip.erase ? Math.min(1, darkness(pressure) * 1.4) : darkness(pressure);
		return { x: sample.x, y: sample.y, width, stretch, angle, alpha };
	}

	private speed(sample: Sample): number {
		const recent = this.recent;
		recent.push({ x: sample.screenX, y: sample.screenY, t: sample.t });
		while (recent.length > 2 && recent[1].t <= sample.t - SPEED_WINDOW) recent.shift();
		let path = 0;
		for (let i = 1; i < recent.length; i++) {
			path += Math.hypot(recent[i].x - recent[i - 1].x, recent[i].y - recent[i - 1].y);
		}
		const span = sample.t - recent[0].t;
		return path / Math.max(span, 8);
	}
}

/**
 * Appends a point, or folds it into the last one when the hand has not
 * moved, keeping the heavier mark. Returns whether a point was appended.
 */
export function addPoint(points: Point[], point: Point): boolean {
	const last = points[points.length - 1];
	if (last && Math.hypot(point.x - last.x, point.y - last.y) < MIN_STEP) {
		last.width = Math.max(last.width, point.width);
		last.alpha = Math.max(last.alpha, point.alpha);
		return false;
	}
	points.push(point);
	return true;
}

/** Length of the tip's footprint through its centre, along a direction of travel. */
export function chord(width: number, stretch: number, angle: number, direction: number): number {
	const long = (width * stretch) / 2;
	const narrow = width / 2;
	const psi = direction - angle;
	return (2 * long * narrow) / Math.hypot(narrow * Math.cos(psi), long * Math.sin(psi));
}

export function spacingFor(width: number): number {
	return Math.max(0.3, width * 0.2);
}

/** Alpha per dab so that the dabs overlapping any spot add up to the target. */
export function dabAlpha(alpha: number, spacing: number, footprint: number): number {
	return 1 - Math.pow(1 - alpha, Math.min(1, spacing / footprint));
}

/** Coverage from the tip's centre (0) to its rim (1): solid core, then a smooth falloff. */
export function profile(r: number, hardness: number): number {
	if (r >= 1) return 0;
	if (r <= hardness) return 1;
	const t = (r - hardness) / (1 - hardness);
	return 1 - t * t * (3 - 2 * t);
}

const HARDNESS_LEVELS = 8;
const SPRITE_SIZES = [4, 8, 16, 32, 64];
const sprites = new Map<string, HTMLCanvasElement>();

/** A pre-drawn tip at one hardness, at the smallest size that still looks sharp. */
function sprite(color: string, hardness: number, size: number): HTMLCanvasElement {
	const level = Math.round(
		clamp((hardness - SOFTEST) / (HARDEST - SOFTEST), 0, 1) * (HARDNESS_LEVELS - 1)
	);
	const px = SPRITE_SIZES.find((s) => s >= size) ?? SPRITE_SIZES[SPRITE_SIZES.length - 1];
	const key = `${color}${level}/${px}`;
	let canvas = sprites.get(key);
	if (canvas) return canvas;
	canvas = document.createElement('canvas');
	canvas.width = canvas.height = px;
	const c = canvas.getContext('2d')!;
	c.fillStyle = color;
	c.fillRect(0, 0, 1, 1);
	const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
	const image = c.createImageData(px, px);
	const h = SOFTEST + ((HARDEST - SOFTEST) * level) / (HARDNESS_LEVELS - 1);
	for (let y = 0; y < px; y++) {
		for (let x = 0; x < px; x++) {
			const d = Math.hypot(x + 0.5 - px / 2, y + 0.5 - px / 2) / (px / 2);
			const i = (y * px + x) * 4;
			image.data[i] = r;
			image.data[i + 1] = g;
			image.data[i + 2] = b;
			image.data[i + 3] = Math.round(profile(d, h) * 255);
		}
	}
	c.putImageData(image, 0, 0);
	sprites.set(key, canvas);
	return canvas;
}

function mixAngle(a: number, b: number, u: number): number {
	// Tip angles repeat every half turn, so blend them as doubled angles.
	const x = Math.cos(2 * a) * (1 - u) + Math.cos(2 * b) * u;
	const y = Math.sin(2 * a) * (1 - u) + Math.sin(2 * b) * u;
	return Math.atan2(y, x) / 2;
}

function dab(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	tip: Pick<Point, 'width' | 'stretch' | 'angle'>,
	alpha: number,
	color: string,
	hardness: number
) {
	const long = tip.width * tip.stretch;
	const cos = Math.cos(tip.angle);
	const sin = Math.sin(tip.angle);
	ctx.globalAlpha = alpha;
	ctx.setTransform(cos * long, sin * long, -sin * tip.width, cos * tip.width, x, y);
	ctx.drawImage(sprite(color, hardness, long), -0.5, -0.5, 1, 1);
}

/**
 * Stamps dabs along the straight line from p1 to p2. `carry` is the distance
 * left until the next dab; the returned carry continues into the next segment.
 */
export function stampSegment(
	ctx: CanvasRenderingContext2D,
	p1: Point,
	p2: Point,
	carry: number,
	erase: boolean
): number {
	const color = erase ? PAPER : GRAPHITE;
	const dx = p2.x - p1.x;
	const dy = p2.y - p1.y;
	const length = Math.hypot(dx, dy);
	const direction = Math.atan2(dy, dx);
	let next = carry;
	while (next <= length) {
		const u = length ? next / length : 0;
		const tip = {
			width: p1.width + (p2.width - p1.width) * u,
			stretch: p1.stretch + (p2.stretch - p1.stretch) * u,
			angle: mixAngle(p1.angle, p2.angle, u)
		};
		const alpha = p1.alpha + (p2.alpha - p1.alpha) * u;
		const spacing = spacingFor(tip.width);
		dab(
			ctx,
			p1.x + dx * u,
			p1.y + dy * u,
			tip,
			dabAlpha(alpha, spacing, chord(tip.width, tip.stretch, tip.angle, direction)),
			color,
			erase ? ERASER_HARDNESS : hardnessFor(alpha)
		);
		next += spacing;
	}
	return next - length;
}

/**
 * Paints one stroke as it grows. A segment is stamped for good once the point
 * after it is known, since a still hand can still press harder at its end; the
 * stretch up to the finger is previewed each frame. Painting a finished stroke
 * in one go gives the same result.
 */
export class StrokePainter {
	private next = 0;
	private carry = 0;

	constructor(readonly stroke: Stroke) {}

	private done(ctx: CanvasRenderingContext2D) {
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.globalAlpha = 1;
	}

	private dot(ctx: CanvasRenderingContext2D, points: Point[]) {
		let width = 0;
		let alpha = 0;
		for (const p of points) {
			width = Math.max(width, p.width);
			alpha = Math.max(alpha, p.alpha);
		}
		const { erase } = this.stroke;
		dab(
			ctx,
			points[0].x,
			points[0].y,
			{ ...points[0], width },
			alpha,
			erase ? PAPER : GRAPHITE,
			erase ? ERASER_HARDNESS : hardnessFor(alpha)
		);
	}

	advance(ctx: CanvasRenderingContext2D) {
		const { points, erase } = this.stroke;
		while (this.next + 2 < points.length) {
			this.carry = stampSegment(ctx, points[this.next], points[this.next + 1], this.carry, erase);
			this.next++;
		}
		this.done(ctx);
	}

	/** Draws the unsettled end of the stroke, and on to any predicted points, without keeping it. */
	preview(ctx: CanvasRenderingContext2D, predicted: Point[] = []) {
		const points = predicted.length ? [...this.stroke.points, ...predicted] : this.stroke.points;
		if (points.length === 1) this.dot(ctx, points);
		let carry = this.carry;
		for (let i = this.next; i + 1 < points.length; i++) {
			carry = stampSegment(ctx, points[i], points[i + 1], carry, this.stroke.erase);
		}
		this.done(ctx);
	}

	finish(ctx: CanvasRenderingContext2D) {
		const { points, erase } = this.stroke;
		for (; this.next + 1 < points.length; this.next++) {
			this.carry = stampSegment(ctx, points[this.next], points[this.next + 1], this.carry, erase);
		}
		// A tap, or a press that barely moved, leaves a full dot rather than a few faint dabs.
		let length = 0;
		let width = 0;
		for (let i = 0; i < points.length; i++) {
			if (i) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
			width = Math.max(width, points[i].width);
		}
		if (length < width / 2) this.dot(ctx, points);
		this.done(ctx);
	}
}

export function paintStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
	new StrokePainter(stroke).finish(ctx);
}
