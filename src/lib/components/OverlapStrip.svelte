<script lang="ts">
	import { OVERLAP_HEIGHT, SECTION_WIDTH } from '$lib/constants';

	let { src, label = 'The edge of what came before' }: { src: string; label?: string } = $props();
</script>

<figure>
	<div class="torn" style:aspect-ratio="{SECTION_WIDTH} / {OVERLAP_HEIGHT}">
		<img {src} alt={label} draggable="false" />
	</div>
	<figcaption class="label">{label}</figcaption>
</figure>

<style>
	figure {
		margin: 0;
		display: grid;
		gap: 0.5rem;
	}

	.torn {
		position: relative;
		width: 100%;
		background: var(--paper);
		/* Ragged top edge: a strip torn from the bottom of someone else's page. */
		clip-path: polygon(
			0% 18%,
			4% 8%,
			8% 16%,
			13% 4%,
			17% 14%,
			22% 6%,
			27% 17%,
			31% 3%,
			36% 13%,
			41% 7%,
			45% 16%,
			50% 2%,
			55% 14%,
			59% 8%,
			64% 18%,
			68% 5%,
			73% 13%,
			78% 3%,
			82% 15%,
			87% 7%,
			91% 17%,
			96% 5%,
			100% 14%,
			100% 100%,
			0% 100%
		);
	}

	img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: fill;
		user-select: none;
		-webkit-user-select: none;
	}

	figcaption {
		text-align: center;
	}
</style>
