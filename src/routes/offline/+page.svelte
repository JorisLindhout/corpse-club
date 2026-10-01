<svelte:head>
	<title>Offline · Corpse Club</title>
</svelte:head>

<section>
	<p class="label">No signal</p>
	<h2>The dark is total</h2>
	<p class="muted">You are offline. Corpses can only be summoned with a connection.</p>
	<button class="btn solid block" type="button" onclick={() => location.reload()}>Try again</button>
</section>

<style>
	section {
		flex: 1;
		display: grid;
		gap: 1.5rem;
		align-content: center;
		max-width: 32rem;
		width: 100%;
		margin: 0 auto;
		padding: var(--pad);
	}
</style>
