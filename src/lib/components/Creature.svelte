<script lang="ts">
	import { head, legs, torso } from '$lib/creature';

	let { animate = true }: { animate?: boolean } = $props();

	const parts = [head, torso, legs];
</script>

<svg viewBox="0 0 200 300" class:animate role="img" aria-label="A three-part creature">
	<defs>
		<filter id="rough" x="-5%" y="-5%" width="110%" height="110%">
			<feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="7" />
			<feDisplacementMap in="SourceGraphic" scale="2.6" />
		</filter>
	</defs>

	<g filter="url(#rough)">
		{#each parts as paths, section (section)}
			<g style:--section={section}>
				{#each paths as d, i (d)}
					<path {d} pathLength="1" style:--i={i} />
				{/each}
			</g>
		{/each}
	</g>

	<g class="folds">
		<line x1="0" y1="100" x2="200" y2="100" />
		<line x1="0" y1="200" x2="200" y2="200" />
	</g>
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
	}

	path {
		fill: none;
		stroke: var(--bone);
		stroke-width: 1.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.animate path {
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
		animation: draw 0.9s var(--ease) forwards;
		animation-delay: calc(var(--section) * 0.9s + var(--i) * 0.08s + 0.2s);
	}

	.folds line {
		stroke: var(--crimson);
		stroke-width: 0.75;
		stroke-dasharray: 3 4;
	}

	.animate .folds line {
		opacity: 0;
		animation: appear 0.2s linear forwards;
	}

	.animate .folds line:first-child {
		animation-delay: 1s;
	}

	.animate .folds line:last-child {
		animation-delay: 1.9s;
	}

	@keyframes draw {
		to {
			stroke-dashoffset: 0;
		}
	}

	@keyframes appear {
		to {
			opacity: 1;
		}
	}
</style>
