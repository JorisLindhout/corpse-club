<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';

	let summoning = $state(false);

	// Every submission creates a corpse, so repeated taps must not stack up.
	const summon: SubmitFunction = ({ cancel }) => {
		if (summoning) {
			cancel();
			return;
		}
		summoning = true;
		return async ({ update }) => {
			try {
				await update();
			} finally {
				summoning = false;
			}
		};
	};
</script>

<section>
	<p class="label">A new corpse</p>
	<h2>You draw the head</h2>
	<p>
		Fill the page. Let the neck run off the bottom edge. The next hand will see only that sliver and
		must continue from it.
	</p>
	<form method="POST" use:enhance={summon}>
		<button class="btn solid block" type="submit" aria-busy={summoning}>
			<span class:pulse={summoning}>{summoning ? 'Summoning' : 'Begin the ritual'}</span>
		</button>
	</form>
</section>

<style>
	section {
		display: grid;
		gap: 1.5rem;
		align-content: center;
		flex: 1;
		max-width: 32rem;
		width: 100%;
		margin: 0 auto;
		padding: var(--pad);
	}
</style>
