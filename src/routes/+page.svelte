<script lang="ts">
	import Creature from '$lib/components/Creature.svelte';
	import { DESCRIPTION, SITE_NAME } from '$lib/seo';

	const ORIGIN = 'https://corpse-club.joris.wtf';
	const structured = JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: SITE_NAME,
		description: DESCRIPTION,
		url: `${ORIGIN}/`,
		image: `${ORIGIN}/og.png`,
		inLanguage: 'en',
		genre: ['Net art', 'Drawing game'],
		isAccessibleForFree: true,
		author: { '@type': 'Person', name: 'Joris Lindhout', url: 'https://joris.wtf/' }
	}).replaceAll('<', '\\u003c');
</script>

<svelte:head>
	{@html `<script type="application/ld+json">${structured}</script>`}
</svelte:head>

<section class="hero">
	<p class="label">Exquisite corpse for three hands</p>
	<h1>Corpse<br />Club</h1>

	<div class="stage">
		<div class="creature">
			<Creature />
		</div>
	</div>
</section>

<style>
	.hero {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding: calc(var(--pad) * 1.5) var(--pad) 0;
		max-width: 32rem;
		width: 100%;
		margin: 0 auto;
		text-align: center;
	}

	.label,
	.stage {
		margin-top: auto;
	}

	/* No taller than the top half of a full-width figure; tall screens spread the slack instead. */
	.stage {
		flex: 1;
		min-height: 6rem;
		max-height: calc(0.75 * (min(100vw, 32rem) - 2 * var(--pad)));
		position: relative;
		overflow: hidden;
	}

	/* The svg centres its figure in a box twice the stage's height, so only the top half shows. */
	.creature {
		position: absolute;
		inset: 0.5rem 0 auto;
		height: 200%;
	}

	.creature :global(svg) {
		height: 100%;
	}
</style>
