<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { SECTION_HEIGHT, SECTION_WIDTH, SECTION_COUNT } from '$lib/constants';
	import { adoptDevice } from '$lib/device';
	import { refreshSubscription } from '$lib/push';
	import type { SubmitFunction } from '@sveltejs/kit';

	let { data } = $props();

	let mark = $state('');
	let markFeedback = $state('');

	const STATUS_LABEL = {
		in_progress: 'In progress',
		complete: 'Complete',
		expired: 'Rotted'
	} as const;

	function date(ms: number) {
		return new Date(ms).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	function hands(sections: (typeof data.corpses)[number]['sections']) {
		const named = sections.filter((s) => s.status === 'complete').map((s) => s.name ?? 'Anonymous');
		return named.length ? named.join(' · ') : 'No hands yet';
	}

	async function copyMark() {
		await navigator.clipboard.writeText(data.deviceId);
		markFeedback = 'Mark copied.';
	}

	async function adopt(e: SubmitEvent) {
		e.preventDefault();
		if (!adoptDevice(mark.trim())) {
			markFeedback = 'That is not a mark.';
			return;
		}
		mark = '';
		markFeedback = 'Mark adopted.';
		await refreshSubscription().catch(() => false);
		await invalidateAll();
	}

	const confirmRemove: SubmitFunction = ({ cancel }) => {
		if (!confirm('Remove this corpse from your collection? The other hands keep theirs.')) cancel();
	};
</script>

<svelte:head>
	<title>My corpses · Corpse Club</title>
</svelte:head>

<section class="gallery">
	<header>
		<p class="label">Your hands have touched</p>
		<h2>My corpses</h2>
	</header>

	{#if data.corpses.length === 0}
		<p class="muted">No corpses yet. Summon one, or wait to be summoned.</p>
	{:else}
		<ul class="grid">
			{#each data.corpses as corpse (corpse.id)}
				<li>
					<a class="tile {corpse.status}" href={resolve('/c/[id]', { id: corpse.id })}>
						<div
							class="thumb"
							style:aspect-ratio="{SECTION_WIDTH} / {SECTION_HEIGHT * SECTION_COUNT}"
						>
							{#if corpse.status === 'complete'}
								<img src="/api/corpse/{corpse.id}/image" alt="" loading="lazy" decoding="async" />
							{:else}
								{#each corpse.sections as s (s.position)}
									<span
										class="slot {s.status}"
										class:active={corpse.status === 'in_progress' &&
											s === corpse.sections.find((x) => x.status !== 'complete')}
									></span>
								{/each}
							{/if}
						</div>
						<div class="info">
							<span class="status">{STATUS_LABEL[corpse.status]}</span>
							<span class="muted small">{date(corpse.completedAt ?? corpse.createdAt)}</span>
							<span class="small">{hands(corpse.sections)}</span>
						</div>
					</a>
					<form method="POST" action="?/remove" use:enhance={confirmRemove}>
						<input type="hidden" name="id" value={corpse.id} />
						<button class="remove label" type="submit">Remove</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}

	<details class="mark">
		<summary class="label">Your mark</summary>
		<p class="muted small">
			This device is known by its mark. To carry your corpses to another browser or to the Home
			Screen app, copy the mark here and adopt it there.
		</p>
		<button class="btn block" type="button" onclick={copyMark}>Copy your mark</button>
		<form class="adopt" onsubmit={adopt}>
			<label class="field">
				<span class="label">Adopt a mark</span>
				<input
					class="input"
					bind:value={mark}
					placeholder="Paste a mark"
					autocomplete="off"
					spellcheck="false"
				/>
			</label>
			<button class="btn" type="submit" disabled={!mark.trim()}>Adopt</button>
		</form>
		<p class="muted small" aria-live="polite">{markFeedback}</p>
	</details>
</section>

<style>
	.gallery {
		display: grid;
		gap: 2rem;
		align-content: start;
		max-width: 40rem;
		width: 100%;
		margin: 0 auto;
		padding: calc(var(--pad) * 1.25) var(--pad);
	}

	header {
		display: grid;
		gap: 0.75rem;
	}

	.grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
	}

	.grid li {
		display: grid;
		grid-template-rows: 1fr auto;
	}

	.tile {
		display: grid;
		gap: 0.75rem;
		align-content: start;
		text-decoration: none;
		height: 100%;
	}

	.tile .thumb {
		transition: opacity 120ms linear;
	}

	.tile:not(.expired):hover .thumb {
		opacity: 0.8;
	}

	.thumb {
		display: grid;
		grid-template-rows: repeat(3, 1fr);
		width: 100%;
		overflow: hidden;
		background: var(--black);
	}

	.thumb img {
		grid-row: 1 / -1;
		width: 100%;
		height: 100%;
		object-fit: cover;
		background: var(--white);
	}

	.slot {
		border: 1px solid #333;
		margin-bottom: -1px;
	}

	.slot.complete {
		background: repeating-linear-gradient(135deg, #222 0 2px, transparent 2px 7px);
		border-color: var(--gray);
	}

	.slot.active {
		border-color: var(--crimson);
		animation: pulse 1.6s steps(2, jump-none) infinite;
	}

	.expired .thumb {
		opacity: 0.4;
	}

	.info {
		display: grid;
		gap: 0.15rem;
	}

	.status {
		font-weight: 600;
		font-size: 0.75rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
	}

	.in_progress .status {
		color: var(--crimson);
	}

	.expired .status {
		color: var(--gray);
		text-decoration: line-through;
	}

	.remove {
		min-height: 2.75rem;
		padding: 0;
		border: 0;
		background: none;
		font-family: inherit;
		cursor: pointer;
		transition: color 120ms linear;
	}

	.remove:hover,
	.remove:active {
		color: var(--crimson);
	}

	.small {
		font-size: 0.8rem;
		overflow-wrap: anywhere;
	}

	.mark {
		display: grid;
		gap: 1rem;
		border-top: 1px solid #1a1a1a;
		padding-top: 1.5rem;
	}

	.mark[open] > :not(summary) {
		margin-top: 1rem;
	}

	summary {
		cursor: pointer;
		list-style: none;
	}

	summary::before {
		content: '+ ';
	}

	.mark[open] summary::before {
		content: '− ';
	}

	.adopt {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.75rem;
		align-items: end;
	}
</style>
