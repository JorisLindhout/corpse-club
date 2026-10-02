import { describe, expect, it } from 'vitest';
import {
	addPoint,
	chord,
	dabAlpha,
	darkness,
	Dynamics,
	hardnessFor,
	profile,
	spacingFor,
	speedEase,
	tiltAngles,
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
		altitude: Math.PI / 2,
		azimuth: 0,
		kind: 'mouse',
		...over
	};
}

function point(over: Partial<Point>): Point {
	return { x: 0, y: 0, width: 4, stretch: 1, angle: 0, alpha: 0.3, ...over };
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
	it('never fully vanishes, and one pass stops short of full graphite', () => {
		expect(darkness(0)).toBeGreaterThan(0);
		expect(darkness(1)).toBeLessThan(1);
		expect(darkness(0.3)).toBeLessThan(darkness(0.7));
	});

	it('uses real pressure from a stylus', () => {
		const light = new Dynamics(TIP).point(sample({ kind: 'pen', pressure: 0.2 }));
		const heavy = new Dynamics(TIP).point(sample({ kind: 'pen', pressure: 0.9 }));
		expect(light.alpha).toBeLessThan(heavy.alpha);
	});

	function moving(kind: string, distance: number): Point {
		const dynamics = new Dynamics(TIP);
		dynamics.point(sample({ kind, pressure: 0.6, t: 0 }));
		return dynamics.point(
			sample({ kind, pressure: 0.6, t: 40, screenX: distance, x: distance * 2 })
		);
	}

	it('draws a finger lighter and thinner when it moves fast', () => {
		expect(moving('touch', 120).alpha).toBeLessThan(moving('touch', 4).alpha);
		expect(moving('touch', 120).width).toBeLessThan(moving('touch', 4).width);
	});

	it('draws a stylus lighter when it moves fast, but less so than a finger', () => {
		const pen = moving('pen', 120).alpha / moving('pen', 4).alpha;
		const finger = moving('touch', 120).alpha / moving('touch', 4).alpha;
		expect(pen).toBeLessThan(1);
		expect(pen).toBeGreaterThan(finger);
	});

	it('firms the edge as pressure rises', () => {
		expect(hardnessFor(darkness(0.1))).toBeLessThan(hardnessFor(darkness(0.9)));
	});
});

describe('tip shape', () => {
	it('reads an upright stylus as upright', () => {
		expect(tiltAngles(0, 0).altitude).toBeCloseTo(Math.PI / 2);
	});

	it('reads lean direction from tilt', () => {
		const right = tiltAngles(40, 0);
		expect(right.azimuth).toBeCloseTo(0);
		expect(right.altitude).toBeCloseTo((50 * Math.PI) / 180);
		expect(tiltAngles(0, 40).azimuth).toBeCloseTo(Math.PI / 2);
	});

	it('is round for an upright stylus and long for a tilted one, along its lean', () => {
		const upright = new Dynamics(TIP).point(sample({ kind: 'pen' }));
		expect(upright.stretch).toBe(1);
		const tilted = new Dynamics(TIP).point(sample({ kind: 'pen', ...tiltAngles(0, 50) }));
		expect(tilted.stretch).toBeGreaterThan(1.5);
		expect(tilted.angle).toBeCloseTo(Math.PI / 2);
	});

	it('gives a finger a flat lead, and the eraser a round one', () => {
		expect(new Dynamics(TIP).point(sample({ kind: 'touch' })).stretch).toBeGreaterThan(1);
		expect(new Dynamics({ ...TIP, erase: true }).point(sample({ kind: 'touch' })).stretch).toBe(1);
	});

	it('measures the footprint along and across the long side', () => {
		expect(chord(4, 2, 0, 0)).toBeCloseTo(8);
		expect(chord(4, 2, 0, Math.PI / 2)).toBeCloseTo(4);
		expect(chord(4, 1, 0, 1.2)).toBeCloseTo(4);
	});
});

describe('edge profile', () => {
	it('is solid in the core and fades to nothing at the rim', () => {
		expect(profile(0, 0.5)).toBe(1);
		expect(profile(0.5, 0.5)).toBe(1);
		expect(profile(0.75, 0.5)).toBeCloseTo(0.5);
		expect(profile(1, 0.5)).toBe(0);
	});

	it('fades sooner for a softer edge', () => {
		expect(profile(0.6, 0.2)).toBeLessThan(profile(0.6, 0.9));
	});
});

describe('dab overlap', () => {
	it('adds up to the target darkness over one footprint', () => {
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

describe('points', () => {
	it('folds a sample that has not moved into the last point, keeping the heavier mark', () => {
		const points: Point[] = [point({})];
		expect(addPoint(points, point({ x: 0.1, width: 5, alpha: 0.6 }))).toBe(false);
		expect(points).toEqual([point({ width: 5, alpha: 0.6 })]);
		expect(addPoint(points, point({ x: 1 }))).toBe(true);
		expect(points).toHaveLength(2);
	});
});
