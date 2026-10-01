export const SITE_NAME = 'Corpse Club';
export const DESCRIPTION = 'Exquisite corpse for three hands. Draw on paper. Reveal together.';

/** What a shared link unfurls into. Pages override it by returning `preview` from their load. */
export interface Preview {
	title: string;
	description: string;
	image: string;
	type: string;
	width: number;
	height: number;
	alt: string;
}

export const DEFAULT_PREVIEW: Preview = {
	title: SITE_NAME,
	description: DESCRIPTION,
	image: '/og.png',
	type: 'image/png',
	width: 1200,
	height: 630,
	alt: 'A clumsy bone-white drawing of a goat-headed devil on black, folded into head, torso and legs by red dashed lines'
};

/** Capability links and per-device pages stay out of search results. */
export const UNLISTED = new Set(['/draw/[token]', '/c/[id]/status', '/my-corpses', '/offline']);
