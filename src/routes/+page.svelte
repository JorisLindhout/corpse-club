<script lang="ts">
	import { resolve } from '$app/paths';
	import Creature from '$lib/components/Creature.svelte';

	const steps = [
		['I', 'Draw the head on paper. Photograph it.'],
		['II', 'Pass the link. The next hand sees only the edge.'],
		['III', 'When the third hand is done, the creature is revealed to all.']
	];
</script>

<section class="hero">
	<p class="label">Exquisite corpse for three hands</p>
	<h1>Corpse<br />Club</h1>

	<div class="creature">
		<Creature />
	</div>

	<p class="lede">
		Draw on paper. See only the edge of what came before. Summon something strange with your
		friends.
	</p>

	<form method="POST" action="/create">
		<button class="btn solid block" type="submit">Summon a corpse</button>
	</form>
	<a class="btn ghost block" href={resolve('/my-corpses')}>My corpses</a>
</section>

<section class="ritual">
	<h2>The ritual</h2>
	<ol>
		{#each steps as [numeral, text] (numeral)}
			<li>
				<span class="numeral">{numeral}</span>
				<span>{text}</span>
			</li>
		{/each}
	</ol>
</section>

<style>
	.hero,
	.ritual {
		padding: calc(var(--pad) * 1.5) var(--pad);
		max-width: 32rem;
		width: 100%;
		margin: 0 auto;
	}

	.hero {
		display: grid;
		gap: 1.5rem;
		text-align: center;
	}

	.creature {
		width: min(62%, 15rem);
		margin: 0.5rem auto;
	}

	.lede {
		color: var(--bone);
		max-width: 22rem;
		margin: 0 auto 0.5rem;
	}

	.ritual {
		border-top: 1px solid #1a1a1a;
		display: grid;
		gap: 1.5rem;
	}

	ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
	}

	li {
		display: grid;
		grid-template-columns: 3rem 1fr;
		gap: 1rem;
		align-items: baseline;
		padding: 1.25rem 0;
		border-top: var(--line);
	}

	li:last-child {
		border-bottom: var(--line);
	}

	.numeral {
		font-family: var(--font-display);
		font-size: 1.6rem;
		color: var(--crimson);
	}
</style>
