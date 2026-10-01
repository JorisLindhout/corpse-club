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
						Drawn by {slot.name ?? 'an anonymous hand'}
					{:else if slot.status === 'active'}
						{#if expired}Abandoned{:else}<span class="pulse">Awaiting a hand</span>{/if}
					{:else}
						Sealed
					{/if}
				</span>
			</span>
			<span class="mark" aria-hidden="true"></span>
		</li>
	{/each}
</ol>

<style>
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
		border: var(--line);
	}

	li {
		display: grid;
		grid-template-columns: 3rem 1fr 1.25rem;
		align-items: center;
		gap: 1rem;
		padding: 1.1rem 1.25rem;
	}

	li + li {
		border-top: 1px dashed var(--gray);
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
		font-size: 0.85rem;
		color: var(--gray);
	}

	.mark {
		width: 1rem;
		height: 1rem;
		border: var(--line);
	}

	.complete .mark {
		background: var(--bone);
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
