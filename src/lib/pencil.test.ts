import { describe, expect, it } from 'vitest';
import {
	addPoint,
	catmullRom,
	dabAlpha,
	darkness,
	Dynamics,
	spacingFor,
	speedEase,
	widthFor,
	type Point,
	type Sample
} from './pencil';

const TIP = { width: 10, erase: false };

function sample(over: Partial<Sample>): Sample {
	return {
		x: 0,
		y: 0,
		screenX: 0,
		screenY: 0,
		t: 0,
		pressure: 0.5,
		contact: 0,
		kind: 'mouse',
		...over
	};
}

describe('speed and width', () => {
	it('is full width when still and thins as the hand speeds up', () => {
		expect(widthFor(TIP, 0)).toBe(10);
		expect(widthFor(TIP, 1)).toBeLessThan(10);
		expect(widthFor(TIP, 2)).toBeLessThan(widthFor(TIP, 1));
		expect(widthFor(TIP, 100)).toBeCloseTo(5.5);
	});

	it('eases from 0 to 1 without passing either', () => {
		expect(speedEase(0)).toBe(0);
		expect(speedEase(1000)).toBe(1);
		expect(speedEase(-1)).toBe(0);
	});
});

describe('pressure and darkness', () => {
	it('never fully vanishes and reaches black at full pressure', () => {
		expect(darkness(0)).toBeGreaterThan(0);
		expect(darkness(1)).toBe(1);
		expect(darkness(0.3)).toBeLessThan(darkness(0.7));
	});

	it('uses real pressure from a stylus', () => {
		const light = new Dynamics(TIP).point(sample({ kind: 'pen', pressure: 0.2 }));
		const heavy = new Dynamics(TIP).point(sample({ kind: 'pen', pressure: 0.9 }));
		expect(light.alpha).toBeLessThan(heavy.alpha);
	});

	it('draws a finger lighter and thinner when it moves fast', () => {
		const slow = new Dynamics(TIP);
		slow.point(sample({ t: 0 }));
		const slowPoint = slow.point(sample({ t: 40, screenX: 4, x: 10 }));
		const fast = new Dynamics(TIP);
		fast.point(sample({ t: 0 }));
		const fastPoint = fast.point(sample({ t: 40, screenX: 120, x: 300 }));
		expect(fastPoint.alpha).toBeLessThan(slowPoint.alpha);
		expect(fastPoint.width).toBeLessThan(slowPoint.width);
	});
});

describe('dab overlap', () => {
	it('adds up to the target darkness over one dab width', () => {
		const width = 8;
		const spacing = spacingFor(width);
		const overlaps = width / spacing;
		const per = dabAlpha(0.4, spacing, width);
		expect(1 - Math.pow(1 - per, overlaps)).toBeCloseTo(0.4);
	});

	it('gives the full darkness to a dab that overlaps nothing', () => {
		expect(dabAlpha(0.4, 10, 2)).toBeCloseTo(0.4);
	});
});

describe('curve', () => {
	const p0 = { x: 0, y: 0 };
	const p1 = { x: 10, y: 0 };
	const p2 = { x: 10, y: 10 };
	const p3 = { x: 20, y: 10 };

	it('passes through its sampled points', () => {
		expect(catmullRom(p0, p1, p2, p3, 0)).toEqual({ x: 10, y: 0 });
		const end = catmullRom(p0, p1, p2, p3, 1);
		expect(end.x).toBeCloseTo(10);
		expect(end.y).toBeCloseTo(10);
	});

	it('stays near the chord on a sharp turn', () => {
		for (let u = 0; u <= 1; u += 0.1) {
			const { x, y } = catmullRom(p0, p1, p2, p3, u);
			expect(Math.abs(x - 10)).toBeLessThan(3);
			expect(y).toBeGreaterThanOrEqual(-0.01);
			expect(y).toBeLessThanOrEqual(10.01);
		}
	});

	it('copes with repeated points', () => {
		const { x, y } = catmullRom(p1, p1, p2, p2, 0.5);
		expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
	});
});

describe('points', () => {
	it('folds a barely moved sample into the last point, keeping the heavier mark', () => {
		const points: Point[] = [{ x: 0, y: 0, width: 4, alpha: 0.3 }];
		expect(addPoint(points, { x: 0.2, y: 0, width: 5, alpha: 0.6 })).toBe(false);
		expect(points).toEqual([{ x: 0, y: 0, width: 5, alpha: 0.6 }]);
		expect(addPoint(points, { x: 3, y: 0, width: 4, alpha: 0.2 })).toBe(true);
		expect(points).toHaveLength(2);
	});
});
