<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { MAX_NAME_LENGTH, ROMAN, SECTION_LABELS } from '$lib/constants';
	import { randomDemon } from '$lib/demons';
	import { cropOverlap, encodeCanvas } from '$lib/image';
	import CameraCapture, { type Crop } from '$lib/components/CameraCapture.svelte';
	import DrawingCanvas from '$lib/components/DrawingCanvas.svelte';
	import ImageAdjust from '$lib/components/ImageAdjust.svelte';
	import OverlapStrip from '$lib/components/OverlapStrip.svelte';
	import PushPrompt from '$lib/components/PushPrompt.svelte';
	import ShareLink from '$lib/components/ShareLink.svelte';

	let { data } = $props();

	const NAME_KEY = 'cc_name';
	const ORDINALS = ['first', 'second', 'third'];

	type Step = 'intro' | 'camera' | 'canvas' | 'adjust' | 'review' | 'sending' | 'sealed';
	type Tool = 'canvas' | 'adjust';
	let step = $state<Step>('intro');
	let name = $state('');
	let capture = $state.raw<{ frame: HTMLCanvasElement; crop: Crop } | null>(null);
	let section = $state.raw<HTMLCanvasElement | null>(null);
	let drawnWith = $state<Tool>('canvas');
	let previewUrl = $state<string | null>(null);
	let failure = $state<string | null>(null);
	let nextInvitePath = $state<string | null>(null);

	let numeral = $derived(ROMAN[data.position - 1]);
	let part = $derived(SECTION_LABELS[data.position - 1]);
	let title = $derived(`${numeral}. ${part}`);
	let partLabel = $derived(`${part} · the ${ORDINALS[data.position - 1]} of three parts`);
	let reviewing = $derived(step === 'review' || step === 'sending');

	onMount(() => {
		name = localStorage.getItem(NAME_KEY) ?? randomDemon();
	});

	function open(next: Step) {
		failure = null;
		step = next;
	}

	function review(canvas: HTMLCanvasElement, tool: Tool) {
		section = canvas;
		drawnWith = tool;
		previewUrl = canvas.toDataURL('image/jpeg', 0.8);
		open('review');
	}

	async function seal() {
		if (!section) return;
		step = 'sending';
		failure = null;
		try {
			const form = new FormData();
			const image = await encodeCanvas(section);
			form.append('image', image, `section.${image.type.split('/')[1]}`);
			if (!data.isLast) {
				const overlap = await encodeCanvas(cropOverlap(section), 0.9);
				form.append('overlap', overlap, `overlap.${overlap.type.split('/')[1]}`);
			}
			const cleanName = name.trim() || randomDemon();
			form.append('name', cleanName);
			localStorage.setItem(NAME_KEY, cleanName);

			const response = await fetch(`/api/draw/${data.token}/submit`, {
				method: 'POST',
				body: form
			});
			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as { message?: string } | null;
				throw new Error(body?.message ?? 'The fold would not hold.');
			}
			const result: { complete: boolean; nextInvitePath: string | null } = await response.json();
			if (result.complete) {
				await goto(resolve('/c/[id]', { id: data.corpseId }));
				return;
			}
			nextInvitePath = result.nextInvitePath;
			step = 'sealed';
		} catch (e) {
			failure = e instanceof Error ? e.message : 'The fold would not hold.';
			step = 'review';
		}
	}
</script>

<svelte:head>
	<title>{title} · Corpse Club</title>
</svelte:head>

{#if step === 'camera'}
	<CameraCapture
		overlapSrc={data.overlapUrl}
		isLast={data.isLast}
		{title}
		oncapture={(frame, crop) => {
			capture = { frame, crop };
			open('adjust');
		}}
		onfallback={() => open('canvas')}
		oncancel={() => open('intro')}
	/>
{/if}

<!-- Kept mounted, hidden, while reviewing so the hand can return to the same page. -->
{#if step === 'canvas' || (reviewing && drawnWith === 'canvas')}
	<div hidden={step !== 'canvas'}>
		<DrawingCanvas
			overlapSrc={data.overlapUrl}
			isLast={data.isLast}
			{title}
			ondone={(canvas) => review(canvas, 'canvas')}
			oncancel={() => open('intro')}
		/>
	</div>
{/if}

{#if capture && (step === 'adjust' || (reviewing && drawnWith === 'adjust'))}
	{#key capture}
		<div hidden={step !== 'adjust'}>
			<ImageAdjust
				source={capture.frame}
				crop={capture.crop}
				isLast={data.isLast}
				{title}
				ondone={(canvas) => review(canvas, 'adjust')}
				onretake={() => open('camera')}
			/>
		</div>
	{/key}
{/if}

{#if step !== 'camera' && step !== 'canvas' && step !== 'adjust'}
	<div class="page">
		<header class="top">
			<a href={resolve('/')} class="wordmark">Corpse Club</a>
		</header>

		<section class="content">
			{#if data.state === 'expired'}
				<p class="label">Too late</p>
				<h2>This corpse has rotted</h2>
				<p class="muted">No hand came in time. It has been laid to rest.</p>
				<a class="btn solid block" href={resolve('/')}>Summon another</a>
			{:else if data.state === 'complete' && step !== 'sealed'}
				<p class="label">{partLabel}</p>
				<h2>Already drawn</h2>
				<p class="muted">Another hand has already drawn this part.</p>
				<a class="btn block" href={resolve('/c/[id]', { id: data.corpseId })}>See the corpse</a>
			{:else if data.state === 'locked'}
				<p class="label">{partLabel}</p>
				<h2>Not yet</h2>
				<p class="muted">The previous hand is still drawing. Return when you are summoned.</p>
			{:else if step === 'sealed'}
				<p class="label">{partLabel}</p>
				<h2>{part} is drawn</h2>
				{#if nextInvitePath}
					<p>Pass the corpse on. Send this link to the next hand. They will see only the edge.</p>
					<ShareLink
						path={nextInvitePath}
						text="Draw the next part of a corpse."
					/>
				{/if}
				<PushPrompt
					corpseId={data.corpseId}
					vapidPublicKey={data.vapidPublicKey}
					deviceId={data.deviceId}
					reason="Be summoned when the corpse is complete."
				/>
				<a class="btn ghost block" href={resolve('/c/[id]/status', { id: data.corpseId })}>
					Watch over the corpse
				</a>
			{:else if reviewing}
				<p class="label">{partLabel}</p>
				<h2>{data.isLast ? 'Unfold the corpse?' : 'Fold the paper?'}</h2>
				{#if previewUrl}
					<img class="preview" src={previewUrl} alt="Your section" />
				{/if}
				<p class="muted">
					{data.isLast
						? 'Yours is the last hand. Unfolding reveals the whole creature to all three.'
						: 'Once folded, the next hand sees only the strip below the red line. There is no going back.'}
				</p>
				{#if failure}
					<p class="blood" role="alert">{failure}</p>
				{/if}
				<button class="btn solid block" type="button" onclick={seal} disabled={step === 'sending'}>
					{#if step === 'sending'}
						<span class="pulse">{data.isLast ? 'Unfolding...' : 'Folding...'}</span>
					{:else}
						{data.isLast ? 'Unfold it' : 'Fold it'}
					{/if}
				</button>
				<button
					class="btn ghost block"
					type="button"
					onclick={() => open(drawnWith)}
					disabled={step === 'sending'}
				>
					{drawnWith === 'canvas' ? 'Keep drawing' : 'Adjust the photo'}
				</button>
			{:else}
				<p class="label">{partLabel}</p>
				<h2>{data.position === 1 ? 'Your turn to draw' : 'You have been summoned'}</h2>

				{#if data.overlapUrl}
					<p>
						You draw <strong>{part.toLowerCase()}</strong>. Below is all you may see of what came
						before. Continue its lines from the top edge of your page.
					</p>
					<OverlapStrip src={data.overlapUrl} />
				{:else}
					<p>
						You draw <strong>{part.toLowerCase()}</strong>. Fill the page and let your lines run off
						the bottom edge. The next hand sees only that sliver.
					</p>
				{/if}

				{#if !data.isLast && data.overlapUrl}
					<p class="muted">Let your lines run off the bottom edge for the next hand.</p>
				{/if}

				<label class="field">
					<span class="label">What should we call you?</span>
					<input
						class="input"
						type="text"
						bind:value={name}
						maxlength={MAX_NAME_LENGTH}
						placeholder="Your name, or a demon's"
						autocomplete="nickname"
					/>
				</label>

				{#if failure}
					<p class="blood" role="alert">{failure}</p>
				{/if}

				<div class="actions">
					<button class="btn solid block" type="button" onclick={() => open('camera')}>
						Draw on paper
					</button>
					<button class="btn block" type="button" onclick={() => open('canvas')}>
						Draw on screen
					</button>
				</div>
			{/if}
		</section>
	</div>
{/if}

<style>
	.page {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		padding: var(--safe-top) 0 var(--safe-bottom);
	}

	.top {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 3.5rem;
		border-bottom: 1px solid #1a1a1a;
	}

	.wordmark {
		font-family: var(--font-display);
		font-size: 1.6rem;
		text-decoration: none;
	}

	.content {
		flex: 1;
		display: grid;
		gap: 1.5rem;
		align-content: center;
		max-width: 32rem;
		width: 100%;
		margin: 0 auto;
		padding: calc(var(--pad) * 1.25) var(--pad);
	}

	strong {
		font-weight: 600;
	}

	.preview {
		display: block;
		width: 100%;
	}

	.actions {
		display: grid;
		gap: 0.75rem;
	}
</style>
