<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>{page.status} · Corpse Club</title>
</svelte:head>

<section>
	<p class="label">{page.status}</p>
	<h2>{page.status === 404 ? 'Nothing lives here' : 'The ritual faltered'}</h2>
	<p class="muted">{page.error?.message ?? 'Something went wrong.'}</p>
	<a class="btn solid block" href={resolve('/')}>Return home</a>
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
