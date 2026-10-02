<script lang="ts">
	import { onMount } from 'svelte';
	import { pushSupport, refreshSubscription, subscribeDevice } from '$lib/push';
	import InstallGuide from './InstallGuide.svelte';

	let {
		vapidPublicKey,
		deviceId,
		reachable,
		reason
	}: { vapidPublicKey: string; deviceId: string; reachable: boolean; reason: string } = $props();

	type State =
		| 'checking'
		| 'idle'
		| 'working'
		| 'subscribed'
		| 'elsewhere'
		| 'denied'
		| 'ios-install'
		| 'in-app'
		| 'unsupported'
		| 'failed';
	let status = $state<State>('checking');
	let canSubscribe = $state(false);

	onMount(() => {
		const support = pushSupport();
		canSubscribe = support === 'supported' && Notification.permission !== 'denied';
		if (support !== 'supported') {
			status = reachable ? 'elsewhere' : support;
			return;
		}
		if (Notification.permission === 'denied') {
			status = reachable ? 'elsewhere' : 'denied';
			return;
		}
		// Permission already granted: tie this browser to the current mark without asking again.
		refreshSubscription()
			.then((found) => (status = found ? 'subscribed' : reachable ? 'elsewhere' : 'idle'))
			.catch(() => (status = 'idle'));
	});

	async function subscribe() {
		status = 'working';
		try {
			await subscribeDevice(vapidPublicKey);
			status = 'subscribed';
		} catch (e) {
			status = e instanceof Error && e.message === 'denied' ? 'denied' : 'failed';
		}
	}
</script>

<div class="summons card">
	{#if status === 'checking'}
		<p class="muted pulse">Listening…</p>
	{:else if status === 'subscribed'}
		<p class="label">Bound</p>
		<p>You will be summoned, for this corpse and every one after.</p>
	{:else if status === 'elsewhere'}
		<p class="label">Bound</p>
		<p>
			Summons reach you where you first agreed to them, such as Corpse Club on your Home Screen.
		</p>
		{#if canSubscribe}
			<button class="btn block" type="button" onclick={subscribe}>Summon me here too</button>
		{/if}
	{:else if status === 'ios-install'}
		<p class="label">Summons on iPhone</p>
		<p>{reason} On iPhone, summons only reach Corpse Club from your Home Screen.</p>
		<InstallGuide kind="ios-install" {deviceId} />
	{:else if status === 'in-app'}
		<p class="label">No summons here</p>
		<p>{reason} This app's built-in browser cannot summon you.</p>
		<InstallGuide kind="in-app" {deviceId} />
	{:else if status === 'unsupported'}
		<p class="label">No summons</p>
		<p class="muted">This browser cannot summon you. Return here to check on the corpse.</p>
	{:else if status === 'denied'}
		<p class="label">Summons refused</p>
		<p class="muted">
			Notifications are blocked for this site. You will have to return on your own.
		</p>
	{:else}
		<p class="label">Summons</p>
		<p>{reason}</p>
		<button class="btn block" type="button" onclick={subscribe} disabled={status === 'working'}>
			{status === 'working' ? 'Binding…' : 'Summon me'}
		</button>
		{#if status === 'failed'}
			<p class="muted">The summons failed. Try again.</p>
		{/if}
	{/if}
</div>

<style>
	.summons {
		display: grid;
		gap: 0.9rem;
	}
</style>
