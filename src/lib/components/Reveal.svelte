<script lang="ts">
	import { onMount } from 'svelte';
	import { SECTION_HEIGHT, SECTION_WIDTH } from '$lib/constants';
	import { loadImage } from '$lib/image';

	let {
		sources,
		alt,
		rememberKey,
		onrevealed
	}: { sources: string[]; alt: string; rememberKey: string; onrevealed?: () => void } = $props();

	let phase = $state<'loading' | 'veiled' | 'revealing' | 'revealed'>('loading');
	let fullWidth = $state(0);
	let fitWidth = $state(0);
	let fit = $state(false);

	let unveiled = $derived(phase === 'revealing' || phase === 'revealed');
	let oversized = $derived(fitWidth > 0 && fitWidth < fullWidth - 1);

	onMount(() => {
		Promise.all(sources.map(loadImage))
			.catch(() => null)
			.then(() => {
				if (sessionStorage.getItem(rememberKey)) unveil(true);
				else phase = 'veiled';
			});
	});

	function unveil(instant = false) {
		sessionStorage.setItem(rememberKey, '1');
		phase = instant ? 'revealed' : 'revealing';
		if (instant) onrevealed?.();
	}

	function toggleFit() {
		fit = !fit;
		if (fit) window.scrollTo({ top: 0, behavior: 'smooth' });
	}
</script>

<div
	class="reveal {phase}"
	class:fit={fit && oversized}
	style:--aspect={SECTION_WIDTH / (SECTION_HEIGHT * sources.length)}
	bind:clientWidth={fullWidth}
>
	<div class="probe" bind:clientWidth={fitWidth}></div>

	{#if unveiled && oversized}
		<div class="controls">
			<button
				class="toggle"
				type="button"
				onclick={toggleFit}
				aria-label={fit ? 'Full size' : 'Shrink to fit'}
				title={fit ? 'Full size' : 'Shrink to fit'}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					{#if fit}
						<path
							d="M12 9V2M9.5 4.5 12 2l2.5 2.5M12 15v7M9.5 19.5 12 22l2.5-2.5M9 12H2M4.5 9.5 2 12l2.5 2.5M15 12h7M19.5 9.5 22 12l-2.5 2.5"
						/>
					{:else}
						<path
							d="M12 2v7M9.5 6.5 12 9l2.5-2.5M12 22v-7M9.5 17.5 12 15l2.5 2.5M2 12h7M6.5 9.5 9 12l-2.5 2.5M22 12h-7M17.5 9.5 15 12l2.5 2.5"
						/>
					{/if}
				</svg>
			</button>
		</div>
	{/if}

	<div class="frame">
		<div class="body" role="img" aria-label={alt}>
			{#each sources as src, i (src)}
				<img
					{src}
					alt=""
					width={SECTION_WIDTH}
					height={SECTION_HEIGHT}
					style:--i={i}
					style:--from="{i * 14}%"
					onanimationend={i === sources.length - 1
						? () => {
								phase = 'revealed';
								onrevealed?.();
							}
						: undefined}
				/>
			{/each}
			{#each sources.slice(1) as src, i (src)}
				<span class="seam" style:top="{((i + 1) / sources.length) * 100}%" style:--i={i}></span>
			{/each}
		</div>
	</div>

	{#if phase === 'loading' || phase === 'veiled'}
		<div class="curtain">
			{#if phase === 'loading'}
				<p class="label pulse">Exhuming...</p>
			{:else}
				<p class="label">Three hands have drawn</p>
				<h2>The corpse is complete</h2>
				<button class="btn solid" type="button" onclick={() => unveil()}>Unveil it</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.reveal {
		/* The width at which the whole corpse fits between the header and the bottom bar. */
		--fit-width: min(
			100%,
			calc(
				(
						100dvh - var(--safe-top) - var(--header-height) - var(--pad) * 2 - var(--nav-height) -
							var(--safe-bottom)
					) *
					var(--aspect)
			)
		);
		position: relative;
		width: 100%;
	}

	.probe {
		width: var(--fit-width);
		height: 0;
	}

	.frame {
		position: relative;
		margin: 0 auto;
	}

	.fit .frame {
		width: var(--fit-width);
	}

	.body {
		position: relative;
		display: grid;
		background: var(--black);
	}

	/* Zero-height so it overlays the corpse; sticks to the top of the window while scrolling. */
	.controls {
		position: sticky;
		top: var(--safe-top);
		z-index: 1;
		display: flex;
		justify-content: flex-end;
		height: 0;
	}

	.toggle {
		margin: 0.75rem 0.75rem 0 0;
		display: grid;
		place-items: center;
		width: 2.5rem;
		height: 2.5rem;
		padding: 0;
		border: var(--line);
		background: var(--scrim);
		color: var(--bone);
		cursor: pointer;
		transition:
			background-color 120ms linear,
			color 120ms linear;
	}

	.toggle:hover,
	.toggle:active {
		background: var(--bone);
		color: var(--black);
	}

	.toggle svg {
		width: 1.4rem;
		height: 1.4rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.25;
		stroke-linecap: square;
	}

	img {
		display: block;
		width: 100%;
		height: auto;
		opacity: 0;
		background: var(--white);
	}

	.revealing img {
		animation: converge 1.9s var(--ease) forwards;
		animation-delay: calc(var(--i) * 0.45s);
	}

	.revealed img {
		opacity: 1;
	}

	/* Each section surfaces apart from the others, then they lock together. */
	@keyframes converge {
		0% {
			opacity: 0;
			transform: translateY(var(--from)) scale(0.96);
		}
		35% {
			opacity: 1;
			transform: translateY(var(--from)) scale(0.96);
		}
		100% {
			opacity: 1;
			transform: none;
		}
	}

	.seam {
		position: absolute;
		left: 0;
		right: 0;
		height: 2px;
		margin-top: -1px;
		background: var(--crimson);
		opacity: 0;
		pointer-events: none;
	}

	.revealing .seam {
		animation: seam 1.4s linear forwards;
		animation-delay: calc(2.3s + var(--i) * 0.15s);
	}

	@keyframes seam {
		0%,
		100% {
			opacity: 0;
		}
		15%,
		40% {
			opacity: 1;
		}
	}

	.loading,
	.veiled {
		flex: 1;
		display: grid;
		align-content: center;
	}

	.loading .body,
	.veiled .body {
		display: none;
	}

	.curtain {
		display: grid;
		gap: 1.5rem;
		justify-items: center;
		padding: var(--pad);
		text-align: center;
	}
</style>
