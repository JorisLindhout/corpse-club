<script lang="ts">
	let { animate = true }: { animate?: boolean } = $props();

	const head = [
		'M62 44 C52 26 42 18 26 8',
		'M138 44 C148 26 158 18 174 8',
		'M60 50 C58 22 142 20 140 50 C143 72 132 86 120 91 L118 100',
		'M60 50 C57 72 68 86 82 91 L84 100',
		'M74 52 a8 9 0 1 0 16 0 a8 9 0 1 0 -16 0',
		'M110 52 a8 9 0 1 0 16 0 a8 9 0 1 0 -16 0',
		'M100 60 L96 70 L104 70 Z',
		'M84 79 L116 79 M90 75 L90 84 M97 75 L97 84 M104 75 L104 84 M111 75 L111 84'
	];
	const torso = [
		'M84 100 L80 114 C56 118 46 126 40 142 L22 186',
		'M118 100 L122 114 C146 118 156 126 160 142 L180 182',
		'M100 108 L100 200',
		'M100 124 C82 124 72 132 72 142 M100 124 C118 124 128 132 128 142',
		'M100 138 C84 138 76 146 76 154 M100 138 C116 138 124 146 124 154',
		'M100 152 C88 152 80 158 80 165 M100 152 C112 152 120 158 120 165',
		'M72 142 C70 166 70 178 70 192 L66 200',
		'M128 142 C130 166 130 178 130 192 L134 200',
		'M22 186 L14 194 M22 186 L20 197 M22 186 L28 195',
		'M180 182 L190 188 M180 182 L184 193 M180 182 L174 192'
	];
	const legs = [
		'M66 200 C58 228 78 238 72 258 L60 288',
		'M134 200 C142 228 122 238 128 258 L140 288',
		'M60 288 L44 296 M60 288 L60 299 M60 288 L74 296',
		'M140 288 L126 296 M140 288 L140 299 M140 288 L156 296',
		'M100 200 C104 220 96 236 108 252 C116 262 126 262 130 270'
	];
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
