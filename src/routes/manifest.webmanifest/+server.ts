import type { RequestHandler } from './$types';
import { isResumePath, isUuid } from '$lib/constants';
import { DESCRIPTION, SITE_NAME } from '$lib/seo';

const ICONS = [
	{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
	{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
	{ src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
	{ src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
	{
		src: '/icons/icon-monochrome-512.png',
		sizes: '512x512',
		type: 'image/png',
		purpose: 'monochrome'
	},
	{ src: '/icons/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
];

/**
 * Manifests are fetched without cookies, so the page passes its mark in the
 * link. iOS gives Home Screen apps fresh storage; the start URL carries the
 * mark across so the installed app wakes up as the same hand, and `next`
 * brings it back to the page it was added from.
 */
export const GET: RequestHandler = ({ url }) => {
	const mark = url.searchParams.get('mark');
	const next = url.searchParams.get('next');
	const params = new URLSearchParams();
	if (isUuid(mark)) {
		params.set('mark', mark.toLowerCase());
		if (isResumePath(next)) params.set('next', next);
	}
	const start = params.size ? `/my-corpses?${params}` : '/my-corpses';

	const manifest = {
		name: SITE_NAME,
		short_name: SITE_NAME,
		description: DESCRIPTION,
		id: '/',
		start_url: start,
		scope: '/',
		display: 'standalone',
		orientation: 'portrait',
		background_color: '#000000',
		theme_color: '#000000',
		categories: ['entertainment', 'games', 'art'],
		icons: ICONS
	};

	return new Response(JSON.stringify(manifest), {
		headers: {
			'content-type': 'application/manifest+json',
			'cache-control': 'private, no-store'
		}
	});
};
