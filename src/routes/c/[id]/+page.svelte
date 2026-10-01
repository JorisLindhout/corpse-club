<script lang="ts">
	import { fade } from 'svelte/transition';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { ROMAN, SECTION_COUNT } from '$lib/constants';
	import { assemble, encodeCanvas } from '$lib/image';
	import { shareLink } from '$lib/share';
	import Reveal from '$lib/components/Reveal.svelte';

	let { data } = $props();

	let revealed = $state(false);
	let busy = $state(false);
	let feedback = $state('');

	let sources = $derived(
		Array.from({ length: SECTION_COUNT }, (_, i) => `/api/corpse/${data.id}/section/${i + 1}`)
	);
	let names = $derived(data.contributors.map((n) => n ?? 'Anonymous'));
	let completed = $derived(
		data.completedAt
			? new Date(data.completedAt).toLocaleDateString('en-GB', {
					day: 'numeric',
					month: 'long',
					year: 'numeric'
				})
			: ''
	);

	async function persistAssembled() {
		if (!data.participant || data.hasAssembled) return;
		try {
			const canvas = await assemble(sources);
			const blob = await encodeCanvas(canvas, 0.85);
			const form = new FormData();
			form.append('image', blob, `assembled.${blob.type.split('/')[1]}`);
			await fetch(`/api/corpse/${data.id}/image`, { method: 'POST', body: form });
		} catch {
			// Best effort: the image endpoint falls back to an on-the-fly composite.
		}
	}

	function onrevealed() {
		revealed = true;
		persistAssembled();
	}

	async function download() {
		busy = true;
		try {
			const canvas = await assemble(sources);
			const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
			if (!blob) throw new Error();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `corpse-${data.id.slice(0, 8)}.png`;
			a.click();
			setTimeout(() => URL.revokeObjectURL(url), 10_000);
		} catch {
			feedback = 'The corpse resists. Try again.';
		} finally {
			busy = false;
		}
	}

	async function share() {
		const outcome = await shareLink({
			url: page.url.href,
			title: 'Corpse Club',
			text: 'A corpse has been summoned. Look upon it.'
		});
		feedback =
			outcome === 'copied'
				? 'Link copied.'
				: outcome === 'failed'
					? 'Copy the address by hand.'
					: '';
	}
</script>

<svelte:head>
	{#if data.status === 'complete'}
		<title>A corpse · Corpse Club</title>
	{:else}
		<title>Rotted · Corpse Club</title>
	{/if}
</svelte:head>

{#if data.status === 'expired'}
	<section class="rotted">
		<p class="label">Laid to rest</p>
		<h2>This corpse has rotted</h2>
		<p class="muted">No hand came in time. Some creatures are never meant to be whole.</p>
		<form method="POST" action="/create">
			<button class="btn solid block" type="submit">Summon another</button>
		</form>
	</section>
{:else}
	<article>
		<Reveal
			{sources}
			alt="The assembled corpse. {data.byline}."
			rememberKey="revealed:{data.id}"
			{onrevealed}
		/>

		{#if revealed}
			<div class="meta" in:fade={{ duration: 400 }}>
				<p class="label">{completed}</p>
				<ol class="hands">
					{#each names as name, i (i)}
						<li><span class="numeral">{ROMAN[i]}</span>{name}</li>
					{/each}
				</ol>
				<div class="actions">
					<button class="btn solid" type="button" onclick={download} disabled={busy}>
						{busy ? 'Exhuming...' : 'Download'}
					</button>
					<button class="btn" type="button" onclick={share}>Share</button>
				</div>
				<p class="muted feedback" aria-live="polite">{feedback}</p>
				<a class="btn ghost block" href={resolve('/my-corpses')}>My corpses</a>
			</div>
		{/if}
	</article>
{/if}

<style>
	article,
	.rotted {
		max-width: 32rem;
		width: 100%;
		margin: 0 auto;
		padding: var(--pad);
	}

	article {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.rotted {
		flex: 1;
		display: grid;
		gap: 1.5rem;
		align-content: center;
	}

	.meta {
		display: grid;
		gap: 1.25rem;
		padding-top: 1.75rem;
	}

	.hands {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.hands li {
		display: grid;
		grid-template-columns: 2.5rem 1fr;
		align-items: baseline;
		padding: 0.75rem 0;
	}

	.hands li + li {
		border-top: 1px solid #1a1a1a;
	}

	.numeral {
		font-family: var(--font-display);
		font-size: 1.3rem;
		color: var(--crimson);
	}

	.actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.feedback {
		min-height: 1.5em;
		text-align: center;
		font-size: 0.85rem;
	}
</style>
