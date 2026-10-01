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
</script>

<div class="reveal {phase}">
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
		position: relative;
		width: 100%;
	}

	.body {
		position: relative;
		display: grid;
		background: var(--black);
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

	.curtain {
		position: absolute;
		inset: 0;
		display: grid;
		gap: 1.5rem;
		align-content: center;
		justify-items: center;
		padding: var(--pad);
		text-align: center;
		background: var(--black);
		min-height: 60vh;
	}

	.loading .body,
	.veiled .body {
		min-height: 60vh;
	}
</style>
