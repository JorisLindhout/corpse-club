<script lang="ts">
	import '../app.css';
	import { afterNavigate, goto, invalidateAll, onNavigate, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { NEW_CORPSE, isResumePath } from '$lib/constants';
	import { claimFirstLaunch, syncDevice } from '$lib/device';
	import { isStandalone } from '$lib/push';
	import splash from '$lib/splash.json';
	import { DEFAULT_PREVIEW, SITE_NAME, UNLISTED } from '$lib/seo';

	let { children, data } = $props();

	let preview = $derived(page.data.preview ?? DEFAULT_PREVIEW);
	let url = $derived(page.url.origin + page.url.pathname);
	let unlisted = $derived(UNLISTED.has(page.route.id ?? ''));
	let immersive = $derived(page.route.id?.startsWith('/draw') ?? false);
	let home = $derived(page.route.id === '/');
	let manifest = $derived.by(() => {
		if (!data.deviceId) return '/manifest.webmanifest';
		const params = new URLSearchParams({ mark: data.deviceId });
		if (isResumePath(page.url.pathname)) params.set('next', page.url.pathname);
		return `/manifest.webmanifest?${params}`;
	});

	afterNavigate(({ type }) => {
		if (type === 'enter') queueMicrotask(claimDevice);
	});

	// The router only accepts replaceState once the entry navigation has settled.
	function claimDevice() {
		const mark = page.url.searchParams.get('mark');
		if (mark !== null && page.route.id === '/my-corpses') {
			const launch = isStandalone() ? claimFirstLaunch(mark) : null;
			const next = page.url.searchParams.get('next');
			if (launch?.first && isResumePath(next)) {
				if (!launch.adopted) syncDevice(data.deviceId);
				goto(next, { replaceState: true, invalidateAll: true });
				return;
			}
			replaceState(resolve('/my-corpses'), page.state);
			if (launch?.adopted) {
				invalidateAll();
				return;
			}
		}
		if (syncDevice(data.deviceId)) invalidateAll();
	}

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
	<title>{SITE_NAME}</title>
	<link rel="manifest" href={manifest} />
	<meta name="description" content={preview.description} />
	{#if unlisted}
		<meta name="robots" content="noindex" />
	{:else}
		<link rel="canonical" href={url} />
	{/if}
	{#each splash as { width, height, ratio } (`${width}x${height}@${ratio}`)}
		<link
			rel="apple-touch-startup-image"
			href="/splash/{width * ratio}x{height * ratio}.png"
			media="(device-width: {width}px) and (device-height: {height}px) and (-webkit-device-pixel-ratio: {ratio}) and (orientation: portrait)"
		/>
	{/each}
	<meta property="og:url" content={url} />
	<meta property="og:title" content={preview.title} />
	<meta property="og:description" content={preview.description} />
	<meta property="og:image" content={new URL(preview.image, page.url).href} />
	<meta property="og:image:type" content={preview.type} />
	<meta property="og:image:width" content={String(preview.width)} />
	<meta property="og:image:height" content={String(preview.height)} />
	<meta property="og:image:alt" content={preview.alt} />
	<meta name="twitter:image:alt" content={preview.alt} />
</svelte:head>

<div class="app" class:immersive>
	{#if !immersive && !home}
		<header class="masthead">
			<a href={resolve('/')} class="wordmark">Corpse Club</a>
		</header>
	{/if}

	<main>
		{@render children()}
	</main>

	{#if !immersive}
		<nav class="bottom" aria-label="Primary">
			<a href={resolve('/draw/[token]', { token: NEW_CORPSE })} class="tab">
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M12 2.5v19M7 7.5h10M8 12.5h8M7 17.5h10" />
				</svg>
				<span>Summon</span>
			</a>
			<a
				href={resolve('/my-corpses')}
				class="tab"
				aria-current={page.route.id === '/my-corpses' ? 'page' : undefined}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M6 21v-9M4 18h4M12 21V4M9.5 17h5M18 21v-9M16 18h4M2.5 21h19" />
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

	.bottom {
		position: fixed;
		inset: auto 0 0;
		z-index: var(--z-nav);
		display: grid;
		grid-template-columns: 1fr 1fr;
		height: calc(var(--nav-height) + var(--safe-bottom));
		padding-bottom: var(--safe-bottom);
		background: var(--black);
		border-top: var(--line);
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
		font-size: var(--text-xs);
		font-weight: 600;
		font-stretch: 75%;
		letter-spacing: var(--tracking);
		text-transform: uppercase;
		text-decoration: none;
		cursor: pointer;
	}

	.tab + .tab {
		border-left: var(--line-faint);
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
