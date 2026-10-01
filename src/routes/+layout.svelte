<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { invalidateAll, onNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { syncDevice } from '$lib/device';

	let { children, data } = $props();

	let immersive = $derived(page.route.id?.startsWith('/draw') ?? false);
	let home = $derived(page.route.id === '/');

	onMount(() => {
		if (syncDevice(data.deviceId)) invalidateAll();
	});

	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		return new Promise((done) => {
			document.startViewTransition(async () => {
				done();
				await navigation.complete;
			});
		});
	});
</script>

<svelte:head>
	<title>Corpse Club</title>
	<meta
		name="description"
		content="Exquisite corpse for three hands. Draw on paper. Reveal together."
	/>
</svelte:head>

<div class="app" class:immersive>
	{#if !immersive && !home}
		<header class="top">
			<a href={resolve('/')} class="wordmark">Corpse Club</a>
		</header>
	{/if}

	<main>
		{@render children()}
	</main>

	{#if !immersive}
		<nav class="bottom" aria-label="Primary">
			<form method="POST" action="/create">
				<button type="submit" class="tab">
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M12 2.5v19M7 7.5h10M8 12.5h8M7 17.5h10" />
					</svg>
					<span>Summon</span>
				</button>
			</form>
			<a
				href={resolve('/my-corpses')}
				class="tab"
				aria-current={page.route.id === '/my-corpses' ? 'page' : undefined}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M4 3.5h7v7H4zM13 3.5h7v7h-7zM4 13.5h7v7H4zM13 13.5h7v7h-7z" />
				</svg>
				<span>My corpses</span>
			</a>
		</nav>
	{/if}
</div>

<style>
	.app {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		padding-top: var(--safe-top);
		padding-bottom: calc(var(--nav-height) + var(--safe-bottom));
	}

	.app.immersive {
		padding: 0;
	}

	main {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.top {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 3.5rem;
		border-bottom: 1px solid #1a1a1a;
	}

	.wordmark {
		font-family: var(--font-display);
		font-size: 1.6rem;
		text-decoration: none;
		letter-spacing: 0.02em;
	}

	.bottom {
		position: fixed;
		inset: auto 0 0;
		z-index: 50;
		display: grid;
		grid-template-columns: 1fr 1fr;
		height: calc(var(--nav-height) + var(--safe-bottom));
		padding-bottom: var(--safe-bottom);
		background: var(--black);
		border-top: var(--line);
	}

	.bottom form {
		display: contents;
	}

	.tab {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		border: 0;
		background: transparent;
		color: var(--gray);
		font: inherit;
		font-size: 0.68rem;
		font-weight: 600;
		font-stretch: 75%;
		letter-spacing: 0.24em;
		text-transform: uppercase;
		text-decoration: none;
		cursor: pointer;
	}

	form + .tab {
		border-left: 1px solid #222;
	}

	.tab:hover,
	.tab[aria-current='page'] {
		color: var(--bone);
	}

	.tab svg {
		width: 1.4rem;
		height: 1.4rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.25;
		stroke-linecap: square;
	}
</style>
