<script lang="ts">
	import { onMount } from 'svelte';
	import { existingSubscription, pushSupport, subscribeToCorpse } from '$lib/push';

	let {
		corpseId,
		vapidPublicKey,
		deviceId,
		reason
	}: { corpseId: string; vapidPublicKey: string; deviceId: string; reason: string } = $props();

	type State =
		| 'checking'
		| 'idle'
		| 'working'
		| 'subscribed'
		| 'denied'
		| 'ios-install'
		| 'unsupported'
		| 'failed';
	let status = $state<State>('checking');
	let copied = $state(false);

	onMount(() => {
		const support = pushSupport();
		if (support !== 'supported') {
			status = support;
			return;
		}
		if (Notification.permission === 'denied') {
			status = 'denied';
			return;
		}
		existingSubscription().then(async (sub) => {
			if (!sub) {
				status = 'idle';
				return;
			}
			// Permission already granted: bind this corpse without asking again.
			try {
				await subscribeToCorpse(corpseId, vapidPublicKey);
				status = 'subscribed';
			} catch {
				status = 'idle';
			}
		});
	});

	async function subscribe() {
		status = 'working';
		try {
			await subscribeToCorpse(corpseId, vapidPublicKey);
			status = 'subscribed';
		} catch (e) {
			status = e instanceof Error && e.message === 'denied' ? 'denied' : 'failed';
		}
	}

	async function copyMark() {
		await navigator.clipboard.writeText(deviceId);
		copied = true;
	}
</script>

<div class="summons card">
	{#if status === 'checking'}
		<p class="muted pulse">Listening...</p>
	{:else if status === 'subscribed'}
		<p class="label">Bound</p>
		<p>You will be summoned.</p>
	{:else if status === 'ios-install'}
		<p class="label">Summons on iPhone</p>
		<p>
			{reason} On iPhone, summons only reach Corpse Club from your Home Screen.
		</p>
		<ol>
			<li>Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</li>
			<li>Open Corpse Club from your Home Screen. Your corpses follow.</li>
			<li>Open this corpse there and ask to be summoned.</li>
		</ol>
		<p class="muted small">
			If your corpses do not follow, copy your mark and adopt it under My corpses in the app.
		</p>
		<button class="btn block" type="button" onclick={copyMark}>
			{copied ? 'Mark copied' : 'Copy your mark'}
		</button>
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
			{status === 'working' ? 'Binding...' : 'Summon me'}
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
