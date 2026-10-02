/**
 * A pencil that only does what the hand does: the line passes through every
 * sampled position, speed thins it, pressure darkens it, and graphite builds
 * up where lines cross. No texture, jitter or tapering is added.
 */

export const PAPER = '#ffffff';
export const GRAPHITE = '#141414';

export interface Tip {
	/** Line width in canvas units when drawn slowly. */
	width: number;
	erase: boolean;
}

export interface Point {
	x: number;
	y: number;
	width: number;
	/** How dark the line is here, 0 to 1. */
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
	kind: string;
}

/** Hand speed, in CSS pixels per millisecond, at which a line is thinnest and lightest. */
const FAST = 2.5;
/** Share of the tip width left at full speed. */
const THINNEST = 0.55;
/** Speed is measured over this many milliseconds, so timer noise does not shake the width. */
const SPEED_WINDOW = 40;
/** Darkness at the lightest touch. */
const LIGHTEST = 0.06;
/** Finger pressure when the device reports no usable contact size. */
const FINGER_PRESSURE = 0.8;
/** Share of darkness lost when a finger moves at full speed. */
const SPEED_LIGHTENS = 0.6;
/** Contact growth over the resting size that counts as full pressure. */
const CONTACT_RANGE = 0.6;
/** Samples closer than this to the previous point add to it instead of starting a new one. */
const MIN_STEP = 0.5;

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
	return LIGHTEST + (1 - LIGHTEST) * clamp(pressure, 0, 1);
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

/** Turns samples of one stroke into points with width and darkness. */
export class Dynamics {
	private recent: { x: number; y: number; t: number }[] = [];

	constructor(private tip: Tip) {}

	point(sample: Sample): Point {
		const speed = this.speed(sample);
		let pressure: number;
		if (sample.kind === 'pen') {
			pressure = sample.pressure;
		} else {
			const press = sample.kind === 'touch' ? contactPressure(sample.contact) : null;
			const base = press === null ? FINGER_PRESSURE : 0.6 + 0.4 * press;
			pressure = base * (1 - SPEED_LIGHTENS * speedEase(speed));
		}
		let alpha = darkness(pressure);
		if (this.tip.erase) alpha = Math.min(1, alpha * 1.25);
		return { x: sample.x, y: sample.y, width: widthFor(this.tip, speed), alpha };
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
 * Appends a point, or folds it into the last one when the hand has barely
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

type Vec = { x: number; y: number };

function knot(a: Vec, b: Vec): number {
	return Math.max(Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)), 1e-4);
}

/**
 * Centripetal Catmull-Rom between p1 (u = 0) and p2 (u = 1). Passes through
 * both and does not loop or overshoot on sharp turns.
 */
export function catmullRom(p0: Vec, p1: Vec, p2: Vec, p3: Vec, u: number): Vec {
	const t1 = knot(p0, p1);
	const t2 = t1 + knot(p1, p2);
	const t3 = t2 + knot(p2, p3);
	const t = t1 + (t2 - t1) * u;
	const mix = (a: Vec, b: Vec, ta: number, tb: number): Vec => {
		const f = (t - ta) / (tb - ta);
		return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
	};
	const a1 = mix(p0, p1, 0, t1);
	const a2 = mix(p1, p2, t1, t2);
	const a3 = mix(p2, p3, t2, t3);
	const b1 = mix(a1, a2, 0, t2);
	const b2 = mix(a2, a3, t1, t3);
	return mix(b1, b2, t1, t2);
}

export function spacingFor(width: number): number {
	return Math.max(0.4, width * 0.25);
}

/** Alpha per dab so that the dabs overlapping any spot add up to the target darkness. */
export function dabAlpha(alpha: number, spacing: number, width: number): number {
	return 1 - Math.pow(1 - alpha, Math.min(1, spacing / width));
}

function dab(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, alpha: number) {
	ctx.globalAlpha = alpha;
	ctx.beginPath();
	ctx.arc(x, y, width / 2, 0, Math.PI * 2);
	ctx.fill();
}

/**
 * Stamps dabs along the curve from p1 to p2. `carry` is the distance left
 * until the next dab; the returned carry continues spacing into the next segment.
 */
export function stampSegment(
	ctx: CanvasRenderingContext2D,
	p0: Vec,
	p1: Point,
	p2: Point,
	p3: Vec,
	carry: number
): number {
	const steps = Math.max(1, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / 1.5));
	let from: Vec = p1;
	let next = carry;
	for (let i = 1; i <= steps; i++) {
		const u0 = (i - 1) / steps;
		const u1 = i / steps;
		const to = i === steps ? p2 : catmullRom(p0, p1, p2, p3, u1);
		const length = Math.hypot(to.x - from.x, to.y - from.y);
		while (next <= length) {
			const f = length ? next / length : 0;
			const u = u0 + (u1 - u0) * f;
			const width = p1.width + (p2.width - p1.width) * u;
			const alpha = p1.alpha + (p2.alpha - p1.alpha) * u;
			const spacing = spacingFor(width);
			dab(
				ctx,
				from.x + (to.x - from.x) * f,
				from.y + (to.y - from.y) * f,
				width,
				dabAlpha(alpha, spacing, width)
			);
			next += spacing;
		}
		next -= length;
		from = to;
	}
	return next;
}

function reflect(point: Vec, about: Vec): Vec {
	return { x: 2 * about.x - point.x, y: 2 * about.y - point.y };
}

/** The curve's control points for the segment from points[i] to points[i + 1]. */
function segment(points: Point[], i: number): [Vec, Point, Point, Vec] {
	const p1 = points[i];
	const p2 = points[i + 1];
	return [points[i - 1] ?? reflect(p2, p1), p1, p2, points[i + 2] ?? reflect(p1, p2)];
}

/**
 * Paints one stroke as it grows. Segments are stamped for good once the point
 * after them is known; the stretch up to the finger is previewed each frame.
 * Painting a finished stroke in one go gives the same result.
 */
export class StrokePainter {
	private next = 0;
	private carry = 0;

	constructor(readonly stroke: Stroke) {}

	private style(ctx: CanvasRenderingContext2D) {
		ctx.fillStyle = this.stroke.erase ? PAPER : GRAPHITE;
	}

	advance(ctx: CanvasRenderingContext2D) {
		const points = this.stroke.points;
		if (this.next + 2 >= points.length) return;
		this.style(ctx);
		while (this.next + 2 < points.length) {
			this.carry = stampSegment(ctx, ...segment(points, this.next), this.carry);
			this.next++;
		}
		ctx.globalAlpha = 1;
	}

	/** Draws the unsettled end of the stroke, and on to any predicted points, without keeping it. */
	preview(ctx: CanvasRenderingContext2D, predicted: Point[] = []) {
		const points = predicted.length ? [...this.stroke.points, ...predicted] : this.stroke.points;
		this.style(ctx);
		if (points.length === 1) {
			dab(ctx, points[0].x, points[0].y, points[0].width, points[0].alpha);
		}
		let carry = this.carry;
		for (let i = this.next; i + 1 < points.length; i++) {
			carry = stampSegment(ctx, ...segment(points, i), carry);
		}
		ctx.globalAlpha = 1;
	}

	finish(ctx: CanvasRenderingContext2D) {
		const points = this.stroke.points;
		this.style(ctx);
		for (; this.next + 1 < points.length; this.next++) {
			this.carry = stampSegment(ctx, ...segment(points, this.next), this.carry);
		}
		// A tap, or a press that barely moved, leaves a full dot rather than a few faint dabs.
		let length = 0;
		let width = 0;
		let alpha = 0;
		for (let i = 0; i < points.length; i++) {
			if (i) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
			width = Math.max(width, points[i].width);
			alpha = Math.max(alpha, points[i].alpha);
		}
		if (length < width / 2) dab(ctx, points[0].x, points[0].y, width, alpha);
		ctx.globalAlpha = 1;
	}
}

export function paintStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
	new StrokePainter(stroke).finish(ctx);
}
