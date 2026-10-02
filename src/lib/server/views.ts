import { SECTION_COUNT } from '../constants';
import { activeSection, type CorpseWithSections } from './repo';

export interface SectionView {
	position: number;
	status: 'complete' | 'active' | 'waiting';
	name: string | null;
	completedAt: number | null;
}

export interface CorpseView {
	id: string;
	status: CorpseWithSections['corpse']['status'];
	createdAt: number;
	completedAt: number | null;
	isCreator: boolean;
	sections: SectionView[];
	/** Only present for the creator and the previous hand, once the previous section is sealed. */
	invitePath: string | null;
}

/** Client-safe view of a corpse. Only the creator and the previous hand see the open invite. */
export function corpseView({ corpse, sections }: CorpseWithSections, deviceId: string): CorpseView {
	const isCreator = corpse.creator_device_id === deviceId;
	const active = corpse.status === 'in_progress' ? activeSection(sections) : undefined;
	const previous = active && sections.find((s) => s.position === active.position - 1);
	const holdsInvite = isCreator || (!!previous?.device_id && previous.device_id === deviceId);

	return {
		id: corpse.id,
		status: corpse.status,
		createdAt: corpse.created_at,
		completedAt: corpse.completed_at,
		isCreator,
		sections: Array.from({ length: SECTION_COUNT }, (_, i) => {
			const s = sections.find((x) => x.position === i + 1);
			return {
				position: i + 1,
				status: s?.status === 'complete' ? 'complete' : s === active ? 'active' : 'waiting',
				name: s?.contributor_name ?? null,
				completedAt: s?.completed_at ?? null
			};
		}),
		invitePath: holdsInvite && active && active.position > 1 ? `/draw/${active.invite_token}` : null
	};
}
