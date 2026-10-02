<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { NEW_CORPSE, ROMAN, SECTION_COUNT, SECTION_LABELS } from '$lib/constants';
	import PushPrompt from '$lib/components/PushPrompt.svelte';
	import SectionSlots from '$lib/components/SectionSlots.svelte';
	import ShareLink from '$lib/components/ShareLink.svelte';

	let { data } = $props();

	let corpse = $derived(data.corpse);
	let active = $derived(corpse.sections.find((s) => s.status === 'active'));
	let expired = $derived(corpse.status === 'expired');

	onMount(() => {
		const timer = setInterval(() => {
			if (document.visibilityState === 'visible') invalidateAll();
		}, 20_000);
		return () => clearInterval(timer);
	});
</script>

<svelte:head>
	<title>Awaiting · Corpse Club</title>
</svelte:head>

<svelte:document
	onvisibilitychange={() => document.visibilityState === 'visible' && invalidateAll()}
/>

<section>
	{#if expired}
		<p class="label">Laid to rest</p>
		<h2>The corpse has rotted</h2>
		<p class="muted">No hand came in time.</p>
	{:else}
		<p class="label">A corpse in progress</p>
		<h2>The corpse grows</h2>
	{/if}

	<SectionSlots sections={corpse.sections} {expired} />

	{#if !expired}
		{#if corpse.invitePath && active}
			<div class="invite">
				<p>
					Summon a hand for <strong>{SECTION_LABELS[active.position - 1].toLowerCase()}</strong>.
					{active.position === SECTION_COUNT ? 'This is the last one.' : ''}
				</p>
				<ShareLink
					path={corpse.invitePath}
					text="Draw part {ROMAN[active.position - 1]} of a corpse."
				/>
			</div>
		{:else}
			<p class="muted">The previous hand holds the next invitation.</p>
		{/if}

		<PushPrompt
			vapidPublicKey={data.vapidPublicKey}
			deviceId={data.deviceId}
			reachable={data.reachable}
			reason="Be summoned as each part is drawn, and when the corpse is complete."
		/>
	{:else}
		<a class="btn solid block" href={resolve('/draw/[token]', { token: NEW_CORPSE })}>
			Summon another
		</a>
	{/if}

	<a class="btn ghost block" href={resolve('/my-corpses')}>My corpses</a>
</section>

<style>
	section {
		display: grid;
		gap: 1.5rem;
		max-width: 32rem;
		width: 100%;
		margin: 0 auto;
		padding: calc(var(--pad) * 1.25) var(--pad);
	}

	.invite {
		display: grid;
		gap: 1rem;
	}

	strong {
		font-weight: 600;
	}
</style>
