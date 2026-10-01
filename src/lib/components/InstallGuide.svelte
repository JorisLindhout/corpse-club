<script lang="ts">
	import { onMount } from 'svelte';
	import { iosBrowser, isIOS, type IosBrowser } from '$lib/push';

	let { kind, deviceId }: { kind: 'ios-install' | 'in-app'; deviceId: string } = $props();

	let browser = $state<IosBrowser>('safari');
	let ios = $state(true);
	let copied = $state<'link' | 'mark' | null>(null);

	onMount(() => {
		browser = iosBrowser(navigator.userAgent);
		ios = isIOS();
	});

	async function copy(what: 'link' | 'mark') {
		await navigator.clipboard.writeText(what === 'link' ? location.href : deviceId);
		copied = what;
	}
</script>

{#if kind === 'in-app'}
	<ol>
		<li>
			Tap this app's <strong>•••</strong> or share button and choose
			<strong>Open in {ios ? 'Safari' : 'browser'}</strong>.
		</li>
		<li>No such option? Copy the link and paste it into {ios ? 'Safari' : 'your browser'}.</li>
	</ol>
	<button class="btn block" type="button" onclick={() => copy('link')}>
		{copied === 'link' ? 'Link copied' : 'Copy the link'}
	</button>
{:else}
	<ol>
		<li>
			{#if browser === 'safari'}
				Tap Safari's <strong>Share</strong> button, the square with an arrow. On newer iPhones it
				hides behind <strong>•••</strong> beside the address bar.
			{:else if browser === 'chrome'}
				Tap the <strong>Share</strong> button in Chrome's address bar, top right.
			{:else}
				Open your browser's menu and tap <strong>Share</strong>.
			{/if}
		</li>
		<li>
			Tap <strong>Add to Home Screen</strong>. You may have to scroll or tap
			<strong>More</strong> to find it.
		</li>
		<li>
			Tap <strong>Add</strong>, then open Corpse Club from your Home Screen. It opens right here.
		</li>
	</ol>
	<p class="muted small">
		A share button on this page only sends the link and cannot do this. If your corpses do not
		follow you into the app, copy your mark and adopt it under My corpses there.
	</p>
	<button class="btn block" type="button" onclick={() => copy('mark')}>
		{copied === 'mark' ? 'Mark copied' : 'Copy your mark'}
	</button>
{/if}

<style>
	ol {
		margin: 0;
		padding-left: 1.25rem;
		display: grid;
		gap: 0.35rem;
		color: var(--bone);
	}

	strong {
		font-weight: 600;
	}

	.small {
		font-size: 0.8rem;
	}
</style>
