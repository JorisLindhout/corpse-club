<script lang="ts">
	import { onMount } from 'svelte';
	import { OVERLAP_HEIGHT, SECTION_HEIGHT, SECTION_WIDTH } from '$lib/constants';
	import { createCanvas } from '$lib/image';
	import OverlapStrip from './OverlapStrip.svelte';

	let {
		overlapSrc,
		isLast,
		title,
		ondone,
		oncancel
	}: {
		overlapSrc: string | null;
		isLast: boolean;
		title: string;
		ondone: (canvas: HTMLCanvasElement) => void;
		oncancel: () => void;
	} = $props();

	const PAPER = '#ffffff';
	const MAX_UNDO = 20;
	const SMOOTHING = 0.42;
	const SIZES = [
		{ id: 'small', width: 4, dot: 5 },
		{ id: 'medium', width: 10, dot: 9 },
		{ id: 'large', width: 24, dot: 15 }
	];
	const PALETTE = [
		{ name: 'Ink', value: '#111111' },
		{ name: 'Blood', value: '#8b0000' },
		{ name: 'Bruise', value: '#2e3566' },
		{ name: 'Bile', value: '#5f6b22' },
		{ name: 'Ash', value: '#8a8a8a' }
	];

	interface Stroke {
		color: string;
		width: number;
		points: number[];
	}

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D;
	/** Strokes older than the undo window, flattened. */
	const base = createCanvas(SECTION_WIDTH, SECTION_HEIGHT);
	/** Base plus undoable strokes. */
	const committed = createCanvas(SECTION_WIDTH, SECTION_HEIGHT);
	let strokes: Stroke[] = [];
	let current: Stroke | null = null;
	let activePointer: number | null = null;
	let smoothX = 0;
	let smoothY = 0;
	let frame = 0;

	let size = $state.raw(SIZES[1]);
	let color = $state(PALETTE[0].value);
	let erasing = $state(false);
	let undoable = $state(0);
	let touched = $state(false);
	let wrapWidth = $state(0);
	let wrapHeight = $state(0);

	let sheetRatio = $derived((SECTION_HEIGHT + (overlapSrc ? OVERLAP_HEIGHT : 0)) / SECTION_WIDTH);
	let sheetWidth = $derived(Math.max(0, Math.min(wrapWidth, wrapHeight / sheetRatio)));

	function fill(target: HTMLCanvasElement) {
		const c = target.getContext('2d')!;
		c.fillStyle = PAPER;
		c.fillRect(0, 0, target.width, target.height);
	}

	function paint(target: CanvasRenderingContext2D, stroke: Stroke) {
		const p = stroke.points;
		target.strokeStyle = stroke.color;
		target.fillStyle = stroke.color;
		target.lineWidth = stroke.width;
		target.lineCap = 'round';
		target.lineJoin = 'round';
		if (p.length <= 4) {
			target.beginPath();
			target.arc(p[0], p[1], stroke.width / 2, 0, Math.PI * 2);
			target.fill();
			return;
		}
		target.beginPath();
		target.moveTo(p[0], p[1]);
		// Quadratic curves through midpoints: smooth joins between samples.
		for (let i = 2; i < p.length - 2; i += 2) {
			target.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
		}
		target.lineTo(p[p.length - 2], p[p.length - 1]);
		target.stroke();
	}

	function rebuild() {
		const c = committed.getContext('2d')!;
		c.drawImage(base, 0, 0);
		for (const stroke of strokes) paint(c, stroke);
		render();
	}

	function render() {
		frame = 0;
		ctx.drawImage(committed, 0, 0);
		if (current) paint(ctx, current);
	}

	function schedule() {
		if (!frame) frame = requestAnimationFrame(render);
	}

	function toCanvas(e: PointerEvent): [number, number] {
		const rect = canvas.getBoundingClientRect();
		return [
			((e.clientX - rect.left) / rect.width) * SECTION_WIDTH,
			((e.clientY - rect.top) / rect.height) * SECTION_HEIGHT
		];
	}

	function down(e: PointerEvent) {
		if (activePointer !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
		activePointer = e.pointerId;
		canvas.setPointerCapture(e.pointerId);
		[smoothX, smoothY] = toCanvas(e);
		current = {
			color: erasing ? PAPER : color,
			width: erasing ? size.width * 2 : size.width,
			points: [smoothX, smoothY]
		};
		schedule();
	}

	function move(e: PointerEvent) {
		if (e.pointerId !== activePointer || !current) return;
		const events = e.getCoalescedEvents?.() ?? [e];
		for (const ev of events.length ? events : [e]) {
			const [x, y] = toCanvas(ev);
			smoothX += (x - smoothX) * SMOOTHING;
			smoothY += (y - smoothY) * SMOOTHING;
			current.points.push(smoothX, smoothY);
		}
		schedule();
	}

	function up(e: PointerEvent) {
		if (e.pointerId !== activePointer || !current) return;
		activePointer = null;
		const [x, y] = toCanvas(e);
		if (current.points.length > 2) current.points.push(x, y);
		strokes.push(current);
		current = null;
		if (strokes.length > MAX_UNDO) paint(base.getContext('2d')!, strokes.shift()!);
		undoable = strokes.length;
		touched = true;
		rebuild();
	}

	function undo() {
		if (!strokes.length) return;
		strokes.pop();
		undoable = strokes.length;
		rebuild();
	}

	function finish() {
		const out = createCanvas(SECTION_WIDTH, SECTION_HEIGHT);
		out.getContext('2d')!.drawImage(committed, 0, 0);
		ondone(out);
	}

	onMount(() => {
		ctx = canvas.getContext('2d')!;
		fill(base);
		fill(committed);
		render();
		return () => cancelAnimationFrame(frame);
	});
</script>

<div class="stage">
	<header>
		<button class="btn ghost" type="button" onclick={oncancel}>Back</button>
		<span class="label">{title}</span>
		<button class="btn ghost" type="button" onclick={undo} disabled={!undoable}>Undo</button>
	</header>

	<div class="wrap" bind:clientWidth={wrapWidth} bind:clientHeight={wrapHeight}>
		<div class="sheet" style:width="{sheetWidth}px">
			{#if overlapSrc}
				<OverlapStrip src={overlapSrc} label="" />
			{/if}
			<div class="paper">
				<canvas
					bind:this={canvas}
					width={SECTION_WIDTH}
					height={SECTION_HEIGHT}
					onpointerdown={down}
					onpointermove={move}
					onpointerup={up}
					onpointercancel={up}
				></canvas>
				{#if !isLast}
					<div class="zone" style:height="{(OVERLAP_HEIGHT / SECTION_HEIGHT) * 100}%">
						<span>Seen by the next hand</span>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<footer>
		<div class="tools" role="toolbar" aria-label="Brush">
			{#each SIZES as option (option.id)}
				<button
					type="button"
					class="tool"
					aria-label="{option.id} brush"
					aria-pressed={size === option && !erasing}
					onclick={() => {
						size = option;
						erasing = false;
					}}
				>
					<span class="dot" style:width="{option.dot}px" style:height="{option.dot}px"></span>
				</button>
			{/each}
			<button
				type="button"
				class="tool"
				aria-label="Eraser"
				aria-pressed={erasing}
				onclick={() => (erasing = !erasing)}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16l8-8 6 6-6 6H8zM10 20h10" /></svg>
			</button>
		</div>

		<div class="tools" role="toolbar" aria-label="Colour">
			{#each PALETTE as swatch (swatch.value)}
				<button
					type="button"
					class="tool swatch"
					aria-label={swatch.name}
					aria-pressed={color === swatch.value && !erasing}
					style:--swatch={swatch.value}
					onclick={() => {
						color = swatch.value;
						erasing = false;
					}}
				></button>
			{/each}
			<label class="tool swatch custom">
				<span class="sr-only">Pick any colour</span>
				<input
					type="color"
					value={color}
					oninput={(e) => {
						color = e.currentTarget.value;
						erasing = false;
					}}
				/>
			</label>
		</div>

		<button class="btn solid block" type="button" onclick={finish} disabled={!touched}>
			Seal this section
		</button>
	</footer>
</div>

<style>
	.stage {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: grid;
		grid-template-rows: auto 1fr auto;
		background: var(--black);
		padding: var(--safe-top) 0 var(--safe-bottom);
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 0.25rem;
		border-bottom: 1px solid #1a1a1a;
	}

	.wrap {
		position: relative;
		min-height: 0;
		margin: 1rem var(--pad);
		display: grid;
		place-items: center;
	}

	.sheet {
		display: grid;
	}

	.sheet :global(figcaption) {
		display: none;
	}

	.paper {
		position: relative;
	}

	canvas {
		display: block;
		width: 100%;
		height: auto;
		touch-action: none;
		cursor: crosshair;
	}

	.zone {
		position: absolute;
		inset: auto 0 0;
		border-top: 1px dashed var(--crimson);
		pointer-events: none;
		display: flex;
		align-items: flex-start;
		justify-content: flex-end;
	}

	.zone span {
		font-size: 0.6rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--crimson);
		padding: 0.15rem 0.35rem;
		transform: translateY(-100%);
	}

	footer {
		display: grid;
		gap: 0.75rem;
		padding: 0.75rem var(--pad) 1rem;
		border-top: var(--line);
	}

	.tools {
		display: flex;
		gap: 0.5rem;
		justify-content: center;
	}

	.tool {
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		padding: 0;
		border: 1px solid #333;
		background: transparent;
		color: var(--bone);
		cursor: pointer;
	}

	.tool[aria-pressed='true'] {
		border-color: var(--bone);
		background: #1a1a1a;
	}

	.tool svg {
		width: 1.3rem;
		height: 1.3rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.25;
	}

	.dot {
		display: block;
		border-radius: 50%;
		background: var(--bone);
	}

	.swatch {
		position: relative;
		background: var(--swatch);
	}

	.swatch[aria-pressed='true'] {
		background: var(--swatch);
		outline: 1px solid var(--bone);
		outline-offset: 3px;
	}

	.custom {
		background: transparent;
	}

	.custom::before {
		content: '+';
		font-size: 1.4rem;
		font-weight: 300;
		line-height: 1;
	}

	.custom input {
		position: absolute;
		inset: 0;
		opacity: 0;
		width: 100%;
		height: 100%;
		cursor: pointer;
	}
</style>
