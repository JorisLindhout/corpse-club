<script lang="ts" module>
	export interface Crop {
		x: number;
		y: number;
		w: number;
		h: number;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { OVERLAP_HEIGHT, SECTION_HEIGHT, SECTION_WIDTH } from '$lib/constants';
	import { createCanvas, inkOverlay } from '$lib/image';

	let {
		overlapSrc,
		isLast,
		title,
		oncapture,
		onfallback,
		onupload,
		oncancel
	}: {
		overlapSrc: string | null;
		isLast: boolean;
		title: string;
		oncapture: (frame: HTMLCanvasElement, crop: Crop) => void;
		onfallback: () => void;
		onupload: () => void;
		oncancel: () => void;
	} = $props();

	const ASPECT = SECTION_HEIGHT / SECTION_WIDTH;
	const MARGIN = 20;

	let video: HTMLVideoElement;
	let stream: MediaStream | null = null;
	let status = $state<'starting' | 'live' | 'failed'>('starting');
	let overlay = $state<string | null>(null);
	let overlayVisible = $state(true);
	let stageWidth = $state(0);
	let stageHeight = $state(0);

	/** Framing guide in stage pixels; leaves room for the strip above. */
	let frame = $derived.by(() => {
		const top = 96;
		const bottom = 150;
		const available = Math.max(0, stageHeight - top - bottom);
		const stripRatio = overlapSrc ? OVERLAP_HEIGHT / SECTION_WIDTH : 0;
		const w = Math.max(0, Math.min(stageWidth - MARGIN * 2, available / (ASPECT + stripRatio)));
		const h = w * ASPECT;
		const strip = w * stripRatio;
		const y = top + strip + (available - h - strip) / 2;
		return { x: (stageWidth - w) / 2, y, w, h, strip };
	});

	onMount(() => {
		let cancelled = false;

		if (overlapSrc) {
			inkOverlay(overlapSrc, [255, 48, 48]).then((url) => (overlay = url));
		}

		if (!navigator.mediaDevices?.getUserMedia) {
			status = 'failed';
		} else {
			navigator.mediaDevices
				.getUserMedia({
					video: {
						facingMode: { ideal: 'environment' },
						width: { ideal: 1920 },
						height: { ideal: 1440 }
					},
					audio: false
				})
				.then(async (media) => {
					if (cancelled) {
						media.getTracks().forEach((t) => t.stop());
						return;
					}
					stream = media;
					video.srcObject = media;
					await video.play();
					status = 'live';
				})
				.catch(() => (status = 'failed'));
		}

		return () => {
			cancelled = true;
			stream?.getTracks().forEach((t) => t.stop());
		};
	});

	function capture() {
		const vw = video.videoWidth;
		const vh = video.videoHeight;
		if (!vw || !vh) return;

		const still = createCanvas(vw, vh);
		still.getContext('2d')!.drawImage(video, 0, 0, vw, vh);

		// Map the on-screen guide back into video pixels (video uses object-fit: cover).
		const scale = Math.max(stageWidth / vw, stageHeight / vh);
		const offsetX = (stageWidth - vw * scale) / 2;
		const offsetY = (stageHeight - vh * scale) / 2;
		const crop: Crop = {
			x: (frame.x - offsetX) / scale,
			y: (frame.y - offsetY) / scale,
			w: frame.w / scale,
			h: frame.h / scale
		};

		stream?.getTracks().forEach((t) => t.stop());
		oncapture(still, crop);
	}
</script>

<div class="stage" bind:clientWidth={stageWidth} bind:clientHeight={stageHeight}>
	<video bind:this={video} playsinline muted autoplay></video>

	{#if status === 'live'}
		<div
			class="guide"
			style:left="{frame.x}px"
			style:top="{frame.y}px"
			style:width="{frame.w}px"
			style:height="{frame.h}px"
		>
			<span class="corner tl"></span><span class="corner tr"></span>
			<span class="corner bl"></span><span class="corner br"></span>
			{#if !isLast}
				<span class="zone" style:height="{(OVERLAP_HEIGHT / SECTION_HEIGHT) * 100}%"></span>
			{/if}
		</div>

		{#if overlay}
			<button
				type="button"
				class="overlay"
				class:hidden={!overlayVisible}
				style:left="{frame.x}px"
				style:top="{frame.y - frame.strip}px"
				style:width="{frame.w}px"
				style:height="{frame.strip}px"
				aria-pressed={overlayVisible}
				aria-label={overlayVisible ? 'Hide the previous edge' : 'Show the previous edge'}
				onclick={() => (overlayVisible = !overlayVisible)}
			>
				<img src={overlay} alt="" draggable="false" />
			</button>
		{/if}
	{/if}

	<header>
		<button class="btn ghost" type="button" onclick={oncancel}>Back</button>
		<span class="label">{title}</span>
		<span class="spacer"></span>
	</header>

	<div class="hint">
		{#if status === 'starting'}
			<p class="pulse">Opening the eye...</p>
		{:else if status === 'failed'}
			<p>The camera will not open.</p>
		{:else if overlay}
			<p>
				Lay your paper inside the frame. Its top edge meets the red lines. Continue them. Tap the
				red edge to hide it.
			</p>
		{:else}
			<p>Lay your paper inside the frame. Draw, then capture.</p>
		{/if}
	</div>

	<footer>
		{#if status === 'failed'}
			<button class="btn solid block" type="button" onclick={onfallback}>Draw on screen</button>
			<button class="btn block" type="button" onclick={onupload}>Upload a photo</button>
		{:else}
			<button class="btn ghost" type="button" onclick={onupload}>Upload</button>
			<button
				class="shutter"
				type="button"
				onclick={capture}
				disabled={status !== 'live'}
				aria-label="Capture"
			></button>
			<button class="btn ghost" type="button" onclick={onfallback}>Screen</button>
		{/if}
	</footer>
</div>

<style>
	.stage {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: var(--black);
		overflow: hidden;
	}

	video {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.guide {
		position: absolute;
		/* Hard-edged mask darkening everything outside the frame. */
		box-shadow: 0 0 0 200vmax rgb(0 0 0 / 0.6);
		outline: 1px solid rgb(240 237 230 / 0.5);
	}

	.corner {
		position: absolute;
		width: 1.25rem;
		height: 1.25rem;
		border: 0 solid var(--bone);
	}

	.tl {
		top: -2px;
		left: -2px;
		border-width: 2px 0 0 2px;
	}

	.tr {
		top: -2px;
		right: -2px;
		border-width: 2px 2px 0 0;
	}

	.bl {
		bottom: -2px;
		left: -2px;
		border-width: 0 0 2px 2px;
	}

	.br {
		bottom: -2px;
		right: -2px;
		border-width: 0 2px 2px 0;
	}

	.zone {
		position: absolute;
		inset: auto 0 0;
		border-top: 1px dashed var(--crimson);
	}

	.overlay {
		position: absolute;
		padding: 0;
		border: 0;
		background: transparent;
		opacity: 0.55;
		cursor: pointer;
	}

	.overlay img {
		display: block;
		width: 100%;
		height: 100%;
	}

	.overlay.hidden {
		opacity: 0.08;
		outline: 1px dashed var(--crimson);
	}

	header {
		position: absolute;
		inset: 0 0 auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--safe-top) 0.25rem 0;
		background: var(--black);
		border-bottom: 1px solid #1a1a1a;
	}

	.spacer {
		width: 5rem;
	}

	.hint {
		position: absolute;
		top: calc(var(--safe-top) + 3.75rem);
		inset-inline: var(--pad);
		text-align: center;
		font-size: 0.82rem;
		color: var(--bone);
	}

	footer {
		position: absolute;
		inset: auto 0 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 1.25rem var(--pad) calc(1.25rem + var(--safe-bottom));
		background: var(--black);
		border-top: var(--line);
	}

	footer:has(.block) {
		flex-direction: column;
	}

	.shutter {
		width: 4.5rem;
		height: 4.5rem;
		padding: 0;
		border: 2px solid var(--bone);
		background: transparent;
		cursor: pointer;
		position: relative;
	}

	.shutter::after {
		content: '';
		position: absolute;
		inset: 6px;
		background: var(--bone);
		transition: background-color 80ms linear;
	}

	.shutter:active::after {
		background: var(--crimson);
	}

	.shutter:disabled {
		opacity: 0.3;
	}
</style>
