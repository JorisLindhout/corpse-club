<script lang="ts">
	import { page } from '$app/state';
	import { shareLink } from '$lib/share';

	let {
		path,
		title = 'Corpse Club',
		text,
		cta = 'Share the link'
	}: { path: string; title?: string; text: string; cta?: string } = $props();

	let feedback = $state('');
	let url = $derived(new URL(path, page.url).href);

	async function share() {
		const outcome = await shareLink({ url, title, text });
		feedback =
			outcome === 'copied'
				? 'Copied. Send it to the next acolyte.'
				: outcome === 'failed'
					? 'Copy the link above yourself.'
					: outcome === 'shared'
						? 'Sent into the dark.'
						: '';
	}
</script>

<div class="share">
	<input
		class="link"
		readonly
		value={url}
		aria-label="Invite link"
		onfocus={(e) => e.currentTarget.select()}
	/>
	<button class="btn solid block" type="button" onclick={share}>{cta}</button>
	<p class="feedback muted" aria-live="polite">{feedback}</p>
</div>

<style>
	.share {
		display: grid;
		gap: 0.75rem;
	}

	.link {
		width: 100%;
		padding: 0.9rem 1rem;
		border: 1px dashed var(--gray);
		border-radius: 0;
		background: transparent;
		color: var(--bone);
		font: inherit;
		font-size: var(--text-sm);
		font-family: ui-monospace, 'SF Mono', Menlo, monospace;
		text-overflow: ellipsis;
	}

	.feedback {
		min-height: 1.5em;
		font-size: var(--text-sm);
		text-align: center;
	}
</style>
