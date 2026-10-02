import { describe, expect, it } from 'vitest';
import { drawState, type CorpseRow, type SectionRow } from './repo';
import { corpseView } from './views';

const corpse = (overrides: Partial<CorpseRow> = {}): CorpseRow => ({
	id: 'c1',
	status: 'in_progress',
	created_at: 0,
	completed_at: null,
	creator_device_id: 'creator',
	...overrides
});

const section = (position: number, overrides: Partial<SectionRow> = {}): SectionRow => ({
	id: `s${position}`,
	corpse_id: 'c1',
	position,
	invite_token: `token-${position}`,
	status: 'pending',
	image_key: null,
	contributor_name: null,
	device_id: null,
	completed_at: null,
	reminder_count: 0,
	last_reminder_at: null,
	activated_at: position === 1 ? 0 : null,
	...overrides
});

describe('drawState', () => {
	it('locks a section until the previous one is sealed', () => {
		const sections = [section(1), section(2), section(3)];
		expect(drawState(corpse(), sections, sections[0])).toBe('open');
		expect(drawState(corpse(), sections, sections[1])).toBe('locked');
	});

	it('reports sealed and expired sections', () => {
		const sections = [section(1, { status: 'complete' }), section(2), section(3)];
		expect(drawState(corpse(), sections, sections[0])).toBe('complete');
		expect(drawState(corpse(), sections, sections[1])).toBe('open');
		expect(drawState(corpse({ status: 'expired' }), sections, sections[1])).toBe('expired');
	});
});

describe('corpseView', () => {
	const sections = [
		section(1, { status: 'complete', contributor_name: 'Joris', device_id: 'first-hand' }),
		section(2, { status: 'drawing' }),
		section(3)
	];

	it('gives the creator the next invitation', () => {
		const view = corpseView({ corpse: corpse(), sections }, 'creator');
		expect(view.invitePath).toBe('/draw/token-2');
		expect(view.sections.map((s) => s.status)).toEqual(['complete', 'active', 'waiting']);
	});

	it('lets the previous hand pass the corpse on', () => {
		const view = corpseView({ corpse: corpse(), sections }, 'first-hand');
		expect(view.invitePath).toBe('/draw/token-2');
	});

	it('never leaks invite tokens to anyone else', () => {
		const view = corpseView({ corpse: corpse(), sections }, 'stranger');
		expect(view.invitePath).toBeNull();
		expect(JSON.stringify(view)).not.toContain('token-');
	});
});
