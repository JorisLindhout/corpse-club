<script lang="ts">
	import { OVERLAP_HEIGHT, SECTION_HEIGHT, SECTION_WIDTH } from '$lib/constants';
	import { bleach, createCanvas } from '$lib/image';
	import type { Crop } from './CameraCapture.svelte';

	let {
		source,
		crop,
		isLast,
		title,
		ondone,
		onretake
	}: {
		source: HTMLCanvasElement;
		crop: Crop;
		isLast: boolean;
		title: string;
		ondone: (canvas: HTMLCanvasElement) => void;
		onretake: () => void;
	} = $props();

	const PREVIEW_SCALE = 0.5;
	const ASPECT = SECTION_HEIGHT / SECTION_WIDTH;

	// Seeded once from the initial crop; the user adjusts from there.
	const initial = (() => crop)();
	const minWidth = initial.w * 0.25;
	let maxWidth = $derived(Math.max(source.width, source.height / ASPECT) * 1.5);

	let centerX = $state(initial.x + initial.w / 2);
	let centerY = $state(initial.y + initial.h / 2);
	let cropWidth = $state(initial.w);
	let rotation = $state(0);
	let bleached = $state(true);

	let preview: HTMLCanvasElement;
	const pointers = new Map<number, { x: number; y: number }>();
	let pinchDistance = 0;

	let zoom = $derived(initial.w / cropWidth);

	function draw(target: HTMLCanvasElement) {
		const ctx = target.getContext('2d', { willReadFrequently: true })!;
		const { width, height } = target;
		ctx.save();
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, width, height);
		const scale = width / cropWidth;
		ctx.translate(width / 2, height / 2);
		ctx.rotate((rotation * Math.PI) / 180);
		ctx.scale(scale, scale);
		ctx.translate(-centerX, -centerY);
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(source, 0, 0);
		ctx.restore();
		if (bleached) bleach(ctx, width, height);
	}

	$effect(() => {
		// Redraw the preview whenever the framing changes.
		void [centerX, centerY, cropWidth, rotation, bleached];
		const frame = requestAnimationFrame(() => draw(preview));
		return () => cancelAnimationFrame(frame);
	});

	function setWidth(next: number) {
		cropWidth = Math.min(maxWidth, Math.max(minWidth, next));
	}

	function down(e: PointerEvent) {
		preview.setPointerCapture(e.pointerId);
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pointers.size === 2) pinchDistance = spread();
	}

	function spread() {
		const [a, b] = [...pointers.values()];
		return Math.hypot(a.x - b.x, a.y - b.y);
	}

	function move(e: PointerEvent) {
		const last = pointers.get(e.pointerId);
		if (!last) return;
		const next = { x: e.clientX, y: e.clientY };
		pointers.set(e.pointerId, next);

		if (pointers.size === 2) {
			const distance = spread();
			if (pinchDistance) setWidth(cropWidth * (pinchDistance / distance));
			pinchDistance = distance;
			return;
		}

		// Screen delta to source pixels, undoing the rotation.
		const perPixel = cropWidth / preview.getBoundingClientRect().width;
		const dx = (next.x - last.x) * perPixel;
		const dy = (next.y - last.y) * perPixel;
		const angle = (-rotation * Math.PI) / 180;
		centerX -= dx * Math.cos(angle) - dy * Math.sin(angle);
		centerY -= dx * Math.sin(angle) + dy * Math.cos(angle);
	}

	function up(e: PointerEvent) {
		pointers.delete(e.pointerId);
		pinchDistance = 0;
	}

	function confirm() {
		const out = createCanvas(SECTION_WIDTH, SECTION_HEIGHT);
		draw(out);
		ondone(out);
	}
</script>

<div class="stage">
	<header class="stage-bar">
		<button class="btn ghost" type="button" onclick={onretake}>Retake</button>
		<span class="label">{title}</span>
		<span class="spacer"></span>
	</header>

	<div class="body">
		<p class="muted hint">Drag to align. Pinch to scale. Keep the top edge true.</p>
		<div class="frame">
			<canvas
				bind:this={preview}
				width={SECTION_WIDTH * PREVIEW_SCALE}
				height={SECTION_HEIGHT * PREVIEW_SCALE}
				onpointerdown={down}
				onpointermove={move}
				onpointerup={up}
				onpointercancel={up}
			></canvas>
			{#if !isLast}
				<span class="zone" style:height="{(OVERLAP_HEIGHT / SECTION_HEIGHT) * 100}%"></span>
			{/if}
		</div>

		<div class="controls">
			<label class="field">
				<span class="label">Scale</span>
				<input
					type="range"
					min="0.5"
					max="3"
					step="0.01"
					value={zoom}
					oninput={(e) => setWidth(initial.w / Number(e.currentTarget.value))}
				/>
			</label>
			<label class="field">
				<span class="label">Tilt {rotation > 0 ? '+' : ''}{rotation.toFixed(1)}°</span>
				<input type="range" min="-15" max="15" step="0.1" bind:value={rotation} />
			</label>
			<label class="toggle">
				<input type="checkbox" bind:checked={bleached} />
				<span>Bleach the paper</span>
			</label>
		</div>
	</div>

	<footer>
		<button class="btn solid block" type="button" onclick={confirm}>This is the one</button>
	</footer>
</div>

<style>
	.stage {
		overflow-y: auto;
	}

	.body {
		display: grid;
		gap: 1.25rem;
		align-content: center;
		padding: 1rem var(--pad);
		max-width: 40rem;
		width: 100%;
		margin: 0 auto;
	}

	.hint {
		text-align: center;
		font-size: var(--text-sm);
	}

	.frame {
		position: relative;
		outline: var(--line);
		outline-offset: 4px;
	}

	canvas {
		display: block;
		width: 100%;
		height: auto;
		touch-action: none;
		cursor: grab;
	}

	.zone {
		position: absolute;
		inset: auto 0 0;
		border-top: 1px dashed var(--crimson);
		pointer-events: none;
	}

	.controls {
		display: grid;
		gap: 1rem;
	}

	input[type='range'] {
		width: 100%;
		accent-color: var(--bone);
	}

	.toggle {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-height: 2.75rem;
		cursor: pointer;
	}

	.toggle input {
		appearance: none;
		width: 1.25rem;
		height: 1.25rem;
		margin: 0;
		border: var(--line);
		background: transparent;
	}

	.toggle input:checked {
		background: var(--bone);
	}

	footer {
		padding: 0.75rem var(--pad) 1rem;
		border-top: var(--line);
	}
</style>
