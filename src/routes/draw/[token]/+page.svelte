<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { MAX_NAME_LENGTH, ROMAN, SECTION_COUNT, SECTION_LABELS } from '$lib/constants';
	import { cropOverlap, createCanvas, encodeCanvas } from '$lib/image';
	import CameraCapture, { type Crop } from '$lib/components/CameraCapture.svelte';
	import DrawingCanvas from '$lib/components/DrawingCanvas.svelte';
	import ImageAdjust from '$lib/components/ImageAdjust.svelte';
	import OverlapStrip from '$lib/components/OverlapStrip.svelte';
	import PushPrompt from '$lib/components/PushPrompt.svelte';
	import ShareLink from '$lib/components/ShareLink.svelte';

	let { data } = $props();

	const NAME_KEY = 'cc_name';

	type Step = 'intro' | 'camera' | 'canvas' | 'adjust' | 'review' | 'sending' | 'sealed';
	let step = $state<Step>('intro');
	let name = $state('');
	let capture = $state.raw<{ frame: HTMLCanvasElement; crop: Crop } | null>(null);
	let section = $state.raw<HTMLCanvasElement | null>(null);
	let previewUrl = $state<string | null>(null);
	let failure = $state<string | null>(null);
	let nextInvitePath = $state<string | null>(null);
	let fileInput: HTMLInputElement;

	let numeral = $derived(ROMAN[data.position - 1]);
	let part = $derived(SECTION_LABELS[data.position - 1]);
	let title = $derived(`${numeral}. ${part}`);

	onMount(() => {
		name = localStorage.getItem(NAME_KEY) ?? '';
	});

	function open(next: Step) {
		failure = null;
		step = next;
	}

	function chooseFile() {
		fileInput.value = '';
		fileInput.click();
	}

	async function fileChosen(e: Event & { currentTarget: HTMLInputElement }) {
		const file = e.currentTarget.files?.[0];
		if (!file) return;
		try {
			const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
			const frame = createCanvas(bitmap.width, bitmap.height);
			frame.getContext('2d')!.drawImage(bitmap, 0, 0);
			bitmap.close();
			const ratio = 3 / 4;
			const w = Math.min(frame.width, frame.height / ratio);
			const h = w * ratio;
			capture = { frame, crop: { x: (frame.width - w) / 2, y: (frame.height - h) / 2, w, h } };
			open('adjust');
		} catch {
			failure = 'That image could not be read.';
		}
	}

	function review(canvas: HTMLCanvasElement) {
		section = canvas;
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
			const cleanName = name.trim();
			if (cleanName) {
				form.append('name', cleanName);
				localStorage.setItem(NAME_KEY, cleanName);
			}

			const response = await fetch(`/api/draw/${data.token}/submit`, {
				method: 'POST',
				body: form
			});
			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as { message?: string } | null;
				throw new Error(body?.message ?? 'The seal would not hold.');
			}
			const result: { complete: boolean; nextInvitePath: string | null } = await response.json();
			if (result.complete) {
				await goto(resolve('/c/[id]', { id: data.corpseId }));
				return;
			}
			nextInvitePath = result.nextInvitePath;
			step = 'sealed';
		} catch (e) {
			failure = e instanceof Error ? e.message : 'The seal would not hold.';
			step = 'review';
		}
	}
</script>

<svelte:head>
	<title>{title} · Corpse Club</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<input
	bind:this={fileInput}
	class="sr-only"
	type="file"
	accept="image/*"
	tabindex="-1"
	aria-hidden="true"
	onchange={fileChosen}
/>

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
		onupload={chooseFile}
		oncancel={() => open('intro')}
	/>
{:else if step === 'canvas'}
	<DrawingCanvas
		overlapSrc={data.overlapUrl}
		isLast={data.isLast}
		{title}
		ondone={review}
		oncancel={() => open('intro')}
	/>
{:else if step === 'adjust' && capture}
	<ImageAdjust
		source={capture.frame}
		crop={capture.crop}
		isLast={data.isLast}
		{title}
		ondone={review}
		onretake={() => open('camera')}
	/>
{:else}
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
				<p class="label">Section {numeral}</p>
				<h2>Already drawn</h2>
				<p class="muted">Another hand has sealed this section.</p>
				<a class="btn block" href={resolve('/c/[id]', { id: data.corpseId })}>See the corpse</a>
			{:else if data.state === 'locked'}
				<p class="label">Section {numeral}</p>
				<h2>Not yet</h2>
				<p class="muted">The previous hand is still drawing. Return when you are summoned.</p>
			{:else if step === 'sealed'}
				<p class="label">Section {numeral} of {ROMAN[SECTION_COUNT - 1]}</p>
				<h2>{part} is drawn</h2>
				{#if nextInvitePath}
					<p>Pass the corpse on. Send this link to the next hand. They will see only the edge.</p>
					<ShareLink
						path={nextInvitePath}
						text="Draw the next part of a corpse. You will see only the edge of what came before."
					/>
					<PushPrompt
						corpseId={data.corpseId}
						vapidPublicKey={data.vapidPublicKey}
						deviceId={data.deviceId}
						reason="Be summoned when the next hand is done."
					/>
					<a class="btn ghost block" href={resolve('/c/[id]/status', { id: data.corpseId })}>
						Watch over the corpse
					</a>
				{:else}
					<p class="pulse">Awaiting the next hand...</p>
					<PushPrompt
						corpseId={data.corpseId}
						vapidPublicKey={data.vapidPublicKey}
						deviceId={data.deviceId}
						reason="Be summoned when the corpse is complete."
					/>
					<a class="btn ghost block" href={resolve('/my-corpses')}>My corpses</a>
				{/if}
			{:else if step === 'review' || step === 'sending'}
				<p class="label">Section {numeral} · {part}</p>
				<h2>Seal it?</h2>
				{#if previewUrl}
					<img class="preview" src={previewUrl} alt="Your section" />
				{/if}
				{#if failure}
					<p class="blood" role="alert">{failure}</p>
				{/if}
				<button class="btn solid block" type="button" onclick={seal} disabled={step === 'sending'}>
					{#if step === 'sending'}<span class="pulse">Sealing...</span>{:else}Seal it{/if}
				</button>
				<button
					class="btn ghost block"
					type="button"
					onclick={() => open('intro')}
					disabled={step === 'sending'}
				>
					Start over
				</button>
			{:else}
				<p class="label">Section {numeral} of {ROMAN[SECTION_COUNT - 1]}</p>
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
						placeholder="Anonymous"
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
					<button class="btn ghost block" type="button" onclick={chooseFile}>
						Upload a photo
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
		border: var(--line);
	}

	.actions {
		display: grid;
		gap: 0.75rem;
	}
</style>
