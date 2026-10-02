import { describe, expect, it } from 'vitest';
import { inkCurve } from './image';

describe('inkCurve', () => {
	it('turns paper and its grain into paper at any ink', () => {
		for (const ink of [0, 0.5, 1]) {
			const curve = inkCurve(ink, 0.4);
			expect(curve(1)).toBeCloseTo(1, 3);
			expect(curve(1.1)).toBe(1);
			expect(curve(0.97)).toBeGreaterThan(0.98);
		}
	});

	it('keeps faint lines visible rather than bleaching them away', () => {
		expect(inkCurve(0, 0.4)(0.85)).toBeLessThan(0.93);
		expect(inkCurve(0.5, 0.4)(0.85)).toBeLessThan(0.93);
	});

	it('keeps the darkest line but lightens faint ones with no ink', () => {
		const curve = inkCurve(0, 0.4);
		expect(curve(0.4)).toBeCloseTo(0.4 / 0.93, 2);
		expect(curve(0.7)).toBeGreaterThan(0.7 / 0.93);
	});

	it('darkens lines as ink rises, up to screen graphite', () => {
		const at = (ink: number) => inkCurve(ink, 0.4)(0.4);
		expect(at(0.5)).toBeLessThan(at(0));
		expect(at(1)).toBeLessThan(at(0.5));
		expect(at(1)).toBeCloseTo(0x26 / 0xed, 2);
	});

	it('does not stretch blank paper grain into lines', () => {
		const curve = inkCurve(1, 0.95);
		expect(curve(0.9)).toBeGreaterThan(0.75);
	});

	it('never gets lighter as the photo gets lighter', () => {
		for (const ink of [0, 0.5, 1]) {
			const curve = inkCurve(ink, 0.3);
			let last = -1;
			for (let t = 0; t <= 1.25; t += 0.01) {
				const value = curve(t);
				expect(value).toBeGreaterThanOrEqual(last - 1e-9);
				last = value;
			}
		}
	});
});
