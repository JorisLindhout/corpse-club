<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		MAX_NAME_LENGTH,
		OVERLAP_HEIGHT,
		ROMAN,
		SECTION_HEIGHT,
		SECTION_LABELS
	} from '$lib/constants';
	import { randomDemon } from '$lib/demons';
	import { cropOverlap, encodeCanvas, overlapHasInk, stripHasInk } from '$lib/image';
	import { pushSupport } from '$lib/push';
	import CameraCapture, { type Crop } from '$lib/components/CameraCapture.svelte';
	import DrawingCanvas from '$lib/components/DrawingCanvas.svelte';
	import ImageAdjust from '$lib/components/ImageAdjust.svelte';
	import InstallGuide from '$lib/components/InstallGuide.svelte';
	import OverlapStrip from '$lib/components/OverlapStrip.svelte';
	import PushPrompt from '$lib/components/PushPrompt.svelte';
	import ShareLink from '$lib/components/ShareLink.svelte';

	let { data } = $props();

	const NAME_KEY = 'cc_name';
	const ORDINALS = ['first', 'second', 'third'];
	/** On clean screen paper, even one faint pencil line counts as a line to continue. */
	const SCREEN_INK = { contrast: 20, share: 0.0005 };

	type Step = 'intro' | 'camera' | 'canvas' | 'adjust' | 'review' | 'sending' | 'sealed';
	type Tool = 'canvas' | 'adjust';
	let step = $state<Step>('intro');
	let name = $state('');
	let capture = $state.raw<{ frame: HTMLCanvasElement; crop: Crop } | null>(null);
	let section = $state.raw<HTMLCanvasElement | null>(null);
	let drawnWith = $state<Tool>('canvas');
	let previewUrl = $state<string | null>(null);
	let failure = $state<string | null>(null);
	let sealed = $state<{ corpseId: string; nextInvitePath: string | null } | null>(null);
	/** The previous acolyte's strip holds no lines to continue. */
	let bareEdge = $state(false);
	/** No lines reach this section's own strip, so the next acolyte would see nothing. */
	let bareFold = $state(false);
	/** Acolytes who cannot be summoned where they are get sent home before they draw. */
	let gate = $state<'checking' | 'ios-install' | 'in-app' | 'open'>('checking');

	let numeral = $derived(ROMAN[data.position - 1]);
	let part = $derived(SECTION_LABELS[data.position - 1]);
	let nextPart = $derived(SECTION_LABELS[data.position]?.toLowerCase());
	let title = $derived(`${numeral}. ${part}`);
	let partLabel = $derived(`${part} · the ${ORDINALS[data.position - 1]} of three parts`);
	let reviewing = $derived(step === 'review' || step === 'sending');

	onMount(() => {
		name = localStorage.getItem(NAME_KEY) ?? randomDemon();
		const support = pushSupport();
		gate =
			!data.reachable && (support === 'ios-install' || support === 'in-app') ? support : 'open';
		if (data.overlapUrl) {
			stripHasInk(data.overlapUrl)
				.then((ink) => (bareEdge = !ink))
				.catch(() => {});
		}
	});

	function open(next: Step) {
		failure = null;
		step = next;
	}

	function review(canvas: HTMLCanvasElement, tool: Tool) {
		section = canvas;
		drawnWith = tool;
		bareFold = !data.isLast && !overlapHasInk(canvas, tool === 'canvas' ? SCREEN_INK : undefined);
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

			const response = await fetch(data.token ? `/api/draw/${data.token}/submit` : '/api/corpse', {
				method: 'POST',
				body: form
			});
			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as { message?: string } | null;
				throw new Error(body?.message ?? 'The fold would not hold.');
			}
			const result: { corpseId: string; complete: boolean; nextInvitePath: string | null } =
				await response.json();
			if (result.complete) {
				await goto(resolve('/c/[id]', { id: result.corpseId }));
				return;
			}
			sealed = { corpseId: result.corpseId, nextInvitePath: result.nextInvitePath };
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
		{bareEdge}
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

<!-- Kept mounted, hidden, while reviewing so the acolyte can return to the same page. -->
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
		<header class="masthead">
			<a href={resolve('/')} class="wordmark">Corpse Club</a>
		</header>

		<section class="content">
			{#if data.state === 'expired'}
				<p class="label">Laid to rest</p>
				<h2>This corpse has rotted</h2>
				<p class="muted">No acolyte came in time. Some creatures are never meant to be whole.</p>
				<a class="btn solid block" href={resolve('/')}>Summon another</a>
			{:else if data.state === 'complete' && step !== 'sealed' && data.isMine}
				<p class="label">{partLabel}</p>
				<h2>{part} is drawn</h2>
				<p class="muted">Your part is done.</p>
				<a class="btn block" href={resolve('/c/[id]/status', { id: data.corpseId })}>
					Watch over the corpse
				</a>
			{:else if data.state === 'complete' && step !== 'sealed'}
				<p class="label">{partLabel}</p>
				<h2>Already drawn</h2>
				<p class="muted">Another acolyte has already drawn this part.</p>
				<a class="btn block" href={resolve('/c/[id]', { id: data.corpseId })}>See the corpse</a>
			{:else if data.state === 'locked'}
				<p class="label">{partLabel}</p>
				<h2>Not yet</h2>
				<p class="muted">The previous acolyte is still drawing. Return when you are summoned.</p>
			{:else if step === 'sealed' && sealed}
				<p class="label">{partLabel}</p>
				<h2>{part} is drawn</h2>
				{#if sealed.nextInvitePath}
					<p>Send this link to whoever draws {nextPart}. They will see only the edge you left.</p>
					<ShareLink path={sealed.nextInvitePath} text="Draw the next part of a corpse." />
				{/if}
				<PushPrompt
					vapidPublicKey={data.vapidPublicKey}
					deviceId={data.deviceId}
					reachable={data.reachable}
					reason="Be summoned as each part is drawn, and when the corpse is complete."
				/>
				<a class="btn ghost block" href={resolve('/c/[id]/status', { id: sealed.corpseId })}>
					Watch over the corpse
				</a>
			{:else if reviewing}
				<p class="label">{partLabel}</p>
				<h2>{data.isLast ? 'Unfold the corpse?' : 'Fold the paper?'}</h2>
				{#if previewUrl}
					<div class="preview">
						<img src={previewUrl} alt="Your section" />
						{#if !data.isLast}
							<span class="fold" style:height="{(OVERLAP_HEIGHT / SECTION_HEIGHT) * 100}%"></span>
						{/if}
					</div>
				{/if}
				{#if bareFold}
					<p class="blood" role="alert">
						Nothing crosses the red line. The next acolyte would find a bare edge, with no lines to
						continue. {drawnWith === 'canvas'
							? 'Draw down into the strip at the bottom.'
							: 'Shift the photo up until your lines reach it, or draw further down your paper and retake.'}
					</p>
				{:else}
					<p class="muted">
						{data.isLast
							? 'You are the last acolyte. Unfolding reveals the whole creature to all three.'
							: 'Once folded, the next acolyte sees only the strip below the red line. There is no going back.'}
					</p>
				{/if}
				{#if failure}
					<p class="blood" role="alert">{failure}</p>
				{/if}
				<div class="actions" class:reversed={bareFold}>
					<button
						class="btn block"
						class:solid={!bareFold}
						class:ghost={bareFold}
						type="button"
						onclick={seal}
						disabled={step === 'sending'}
					>
						{#if step === 'sending'}
							<span class="pulse">{data.isLast ? 'Unfolding…' : 'Folding…'}</span>
						{:else if bareFold}
							Fold it anyway
						{:else}
							{data.isLast ? 'Unfold it' : 'Fold it'}
						{/if}
					</button>
					<button
						class="btn block"
						class:solid={bareFold}
						class:ghost={!bareFold}
						type="button"
						onclick={() => open(drawnWith)}
						disabled={step === 'sending'}
					>
						{drawnWith === 'canvas' ? 'Keep drawing' : 'Adjust the photo'}
					</button>
				</div>
			{:else if gate === 'ios-install' || gate === 'in-app'}
				<p class="label">{partLabel}</p>
				<h2>Take the corpse home</h2>
				{#if gate === 'ios-install'}
					<p>
						On iPhone, Corpse Club can only summon you from your Home Screen. Without it, you will
						not hear when the corpse is complete, or when it waits on you.
					</p>
				{:else}
					<p>
						This app's built-in browser cannot summon you, so you would not hear when the corpse is
						complete. Open it in your own browser first.
					</p>
				{/if}
				<InstallGuide kind={gate} deviceId={data.deviceId} />
				<button class="btn ghost block" type="button" onclick={() => (gate = 'open')}>
					Draw without summons
				</button>
			{:else if gate === 'open'}
				<p class="label">{partLabel}</p>
				<h2>{data.position === 1 ? 'Your turn to draw' : 'You have been summoned'}</h2>

				{#if data.overlapUrl && bareEdge}
					<p>
						You draw <strong>{part.toLowerCase()}</strong>. The previous acolyte stopped short of
						the fold and left the edge bare. There are no lines to continue, so begin anywhere along
						the top edge of your page.
					</p>
					<OverlapStrip src={data.overlapUrl} label="A bare edge" />
				{:else if data.overlapUrl}
					<p>
						You draw <strong>{part.toLowerCase()}</strong>. Below is all you may see of what came
						before. Continue its lines from the top edge of your page.
					</p>
					<OverlapStrip src={data.overlapUrl} />
				{:else}
					<p>
						You draw <strong>{part.toLowerCase()}</strong>. Fill the page and let your lines run off
						the bottom edge. The next acolyte sees only that sliver.
					</p>
				{/if}

				{#if !data.isLast && data.overlapUrl}
					<p class="muted">
						Let your lines run off the bottom edge, so the next acolyte has something to continue.
					</p>
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
		position: relative;
	}

	.preview img {
		display: block;
		width: 100%;
	}

	.fold {
		position: absolute;
		inset: auto 0 0;
		border-top: 1px dashed var(--crimson);
		pointer-events: none;
	}

	.actions {
		display: grid;
		gap: 0.75rem;
	}

	.actions.reversed > :first-child {
		order: 1;
	}
</style>
