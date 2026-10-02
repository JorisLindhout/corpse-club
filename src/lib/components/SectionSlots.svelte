<script lang="ts">
	import { ROMAN, SECTION_LABELS } from '$lib/constants';

	interface Slot {
		position: number;
		status: 'complete' | 'active' | 'waiting';
		name: string | null;
	}

	let { sections, expired = false }: { sections: Slot[]; expired?: boolean } = $props();
</script>

<ol class:expired>
	{#each sections as slot (slot.position)}
		<li class={slot.status}>
			<span class="numeral">{ROMAN[slot.position - 1]}</span>
			<span class="what">
				<span class="part">{SECTION_LABELS[slot.position - 1]}</span>
				<span class="state">
					{#if slot.status === 'complete'}
						Drawn by {slot.name ?? 'an anonymous acolyte'}
					{:else if slot.status === 'active'}
						{expired ? 'Abandoned' : 'Awaiting an acolyte'}
					{:else}
						Waits its turn
					{/if}
				</span>
			</span>
			{#if slot.status === 'complete'}
				<svg class="mark" viewBox="0 0 24 24" aria-hidden="true">
					<path d="M12 3v18M7.5 15.5h9" />
				</svg>
			{:else}
				<span class="mark" aria-hidden="true"></span>
			{/if}
		</li>
	{/each}
</ol>

<style>
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	li {
		display: grid;
		grid-template-columns: 2.5rem 1fr 1.25rem;
		align-items: center;
		gap: 1rem;
		padding: 1rem 0;
	}

	li + li {
		border-top: var(--line-faint);
	}

	.numeral {
		font-family: var(--font-display);
		font-size: 1.75rem;
	}

	.what {
		display: grid;
	}

	.part {
		font-weight: 600;
	}

	.state {
		font-size: var(--text-sm);
		color: var(--gray);
	}

	.mark {
		width: 1rem;
		height: 1rem;
		border: var(--line);
	}

	svg.mark {
		width: 1.25rem;
		height: 1.25rem;
		border: 0;
		fill: none;
		stroke: var(--bone);
		stroke-width: 1.5;
		stroke-linecap: square;
	}

	.active .numeral,
	.active .state {
		color: var(--crimson);
	}

	.active .mark {
		border-color: var(--crimson);
	}

	.waiting {
		color: var(--gray);
	}

	.waiting .mark {
		border-color: var(--gray);
	}

	.expired .active .numeral,
	.expired .active .state {
		color: var(--gray);
		text-decoration: line-through;
	}
</style>
