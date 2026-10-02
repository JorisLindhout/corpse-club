<script lang="ts">
	import { onMount } from 'svelte';
	import { OVERLAP_HEIGHT, PAPER, SECTION_HEIGHT, SECTION_WIDTH } from '$lib/constants';
	import { createCanvas } from '$lib/image';
	import {
		addPoint,
		clamp,
		Dynamics,
		paintStroke,
		StrokePainter,
		tiltAngles,
		type Point,
		type Sample,
		type Stroke
	} from '$lib/pencil';
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

	const MAX_UNDO = 20;
	const MAX_ZOOM = 4;
	const TIPS = [
		{ id: 'fine', label: 'Fine', width: 3, mark: 1 },
		{ id: 'broad', label: 'Broad', width: 9, mark: 2.5 },
		{ id: 'thick', label: 'Thick', width: 30, mark: 5 }
	];
	const MARK = 'M4 17c3-7 6-9 8-5s5 2 8-5';
	/** The eraser is a little wider than the tip it turns, so one pass clears that tip's line. */
	const ERASER_WIDTH = 1.3;

	let sheet: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D;
	/** Strokes older than the undo window, flattened. */
	const base = createCanvas(SECTION_WIDTH, SECTION_HEIGHT);
	/** Base plus undoable strokes. */
	const committed = createCanvas(SECTION_WIDTH, SECTION_HEIGHT);
	/** The stroke in progress, as far as it is settled. */
	const live = createCanvas(SECTION_WIDTH, SECTION_HEIGHT);
	let liveCtx: CanvasRenderingContext2D;
	let strokes: Stroke[] = [];
	let drawing: {
		pointer: number;
		kind: string;
		stroke: Stroke;
		painter: StrokePainter;
		dynamics: Dynamics;
	} | null = null;
	/** Where the browser expects the finger to be next; shown for one frame, never kept. */
	let predicted: Point[] = [];
	let frame = 0;

	/** Fingers on the sheet, in client pixels. */
	const touches = new Map<number, { x: number; y: number }>();
	let pinch: {
		distance: number;
		zoom: number;
		originX: number;
		originY: number;
		localX: number;
		localY: number;
	} | null = null;
	/** Once two fingers land, no stroke starts until every finger has lifted. */
	let gesturing = false;

	let tip = $state.raw(TIPS[0]);
	/** Turns whichever tip is chosen into an eraser of its size. */
	let erasing = $state(false);
	let undoable = $state(0);
	let touched = $state(false);
	let zoom = $state(1);
	let panX = $state(0);
	let panY = $state(0);
	let wrapWidth = $state(0);
	let wrapHeight = $state(0);

	let sheetRatio = $derived((SECTION_HEIGHT + (overlapSrc ? OVERLAP_HEIGHT : 0)) / SECTION_WIDTH);
	let sheetWidth = $derived(Math.max(0, Math.min(wrapWidth, wrapHeight / sheetRatio)));
	let zoomed = $derived(zoom !== 1 || panX !== 0 || panY !== 0);

	function fill(target: HTMLCanvasElement) {
		const c = target.getContext('2d')!;
		c.fillStyle = PAPER;
		c.fillRect(0, 0, target.width, target.height);
	}

	function rebuild() {
		const c = committed.getContext('2d')!;
		c.drawImage(base, 0, 0);
		for (const stroke of strokes) paintStroke(c, stroke);
		render();
	}

	function render() {
		frame = 0;
		ctx.drawImage(committed, 0, 0);
		if (drawing) {
			ctx.drawImage(live, 0, 0);
			drawing.painter.preview(ctx, predicted);
		}
	}

	function schedule() {
		if (!frame) frame = requestAnimationFrame(render);
	}

	function toCanvas(e: PointerEvent, rect: DOMRect): [number, number] {
		return [
			((e.clientX - rect.left) / rect.width) * SECTION_WIDTH,
			((e.clientY - rect.top) / rect.height) * SECTION_HEIGHT
		];
	}

	function sample(e: PointerEvent, rect: DOMRect): Sample {
		const [x, y] = toCanvas(e, rect);
		return {
			x,
			y,
			screenX: e.clientX,
			screenY: e.clientY,
			t: e.timeStamp,
			pressure: e.pressure,
			contact: Math.max(e.width, e.height),
			...tiltAngles(e.tiltX, e.tiltY),
			kind: e.pointerType
		};
	}

	function begin(e: PointerEvent) {
		const stroke: Stroke = { erase: erasing, points: [] };
		const dynamics = new Dynamics({
			width: erasing ? tip.width * ERASER_WIDTH : tip.width,
			erase: erasing
		});
		drawing = {
			pointer: e.pointerId,
			kind: e.pointerType,
			stroke,
			painter: new StrokePainter(stroke),
			dynamics
		};
		liveCtx.clearRect(0, 0, SECTION_WIDTH, SECTION_HEIGHT);
		addPoint(stroke.points, dynamics.point(sample(e, canvas.getBoundingClientRect())));
		schedule();
	}

	function discard() {
		drawing = null;
		predicted = [];
		schedule();
	}

	function commit() {
		if (!drawing) return;
		drawing.painter.finish(liveCtx);
		strokes.push(drawing.stroke);
		committed.getContext('2d')!.drawImage(live, 0, 0);
		if (strokes.length > MAX_UNDO) paintStroke(base.getContext('2d')!, strokes.shift()!);
		undoable = strokes.length;
		touched = true;
		drawing = null;
		predicted = [];
		render();
	}

	function startPinch() {
		const [a, b] = touches.values();
		const rect = sheet.getBoundingClientRect();
		const midX = (a.x + b.x) / 2;
		const midY = (a.y + b.y) / 2;
		gesturing = true;
		pinch = {
			distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
			zoom,
			originX: rect.left - panX,
			originY: rect.top - panY,
			localX: (midX - rect.left) / zoom,
			localY: (midY - rect.top) / zoom
		};
	}

	function movePinch() {
		if (!pinch) return;
		const [a, b] = touches.values();
		const next = clamp(
			(pinch.zoom * Math.hypot(b.x - a.x, b.y - a.y)) / pinch.distance,
			1,
			MAX_ZOOM
		);
		const midX = (a.x + b.x) / 2;
		const midY = (a.y + b.y) / 2;
		zoom = next;
		// The zoomed sheet always covers its own unzoomed box.
		panX = clamp(midX - pinch.originX - pinch.localX * next, sheetWidth * (1 - next), 0);
		panY = clamp(
			midY - pinch.originY - pinch.localY * next,
			sheetWidth * sheetRatio * (1 - next),
			0
		);
	}

	function resetZoom() {
		zoom = 1;
		panX = 0;
		panY = 0;
	}

	function down(e: PointerEvent & { currentTarget: HTMLElement }) {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		if (e.pointerType === 'touch') {
			// A palm resting on the screen while a stylus draws.
			if (drawing?.kind === 'pen') return;
			touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
		}
		e.currentTarget.setPointerCapture(e.pointerId);
		if (touches.size >= 2) {
			if (drawing?.kind === 'touch') discard();
			startPinch();
			return;
		}
		if (drawing || gesturing) return;
		begin(e);
	}

	function move(e: PointerEvent) {
		if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pinch) {
			movePinch();
			return;
		}
		if (!drawing || e.pointerId !== drawing.pointer) return;
		const { points } = drawing.stroke;
		const rect = canvas.getBoundingClientRect();
		const events = e.getCoalescedEvents?.() ?? [];
		for (const ev of events.length ? events : [e]) {
			addPoint(points, drawing.dynamics.point(sample(ev, rect)));
		}
		drawing.painter.advance(liveCtx);
		const last = points[points.length - 1];
		predicted = (e.getPredictedEvents?.() ?? []).map((ev) => {
			const [x, y] = toCanvas(ev, rect);
			return { ...last, x, y };
		});
		schedule();
	}

	function up(e: PointerEvent) {
		if (touches.delete(e.pointerId) && pinch) {
			if (touches.size >= 2) startPinch();
			else pinch = null;
		}
		if (!touches.size) gesturing = false;
		if (!drawing || e.pointerId !== drawing.pointer) return;
		if (e.type === 'pointerup') {
			addPoint(
				drawing.stroke.points,
				drawing.dynamics.point(sample(e, canvas.getBoundingClientRect()))
			);
		}
		commit();
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
		ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })!;
		liveCtx = live.getContext('2d')!;
		fill(base);
		fill(committed);
		render();
		return () => cancelAnimationFrame(frame);
	});
</script>

<div class="stage">
	<header class="stage-bar">
		<button class="btn ghost" type="button" onclick={oncancel}>Back</button>
		<span class="label">{title}</span>
		<button class="btn ghost" type="button" onclick={undo} disabled={!undoable}>Undo</button>
	</header>

	<div class="wrap" bind:clientWidth={wrapWidth} bind:clientHeight={wrapHeight}>
		<!-- Strokes may start on the previous acolyte's strip; graphite is clipped at the paper's edge. -->
		<div
			bind:this={sheet}
			class="sheet"
			role="application"
			aria-label="Drawing paper"
			style:width="{sheetWidth}px"
			style:transform="translate({panX}px, {panY}px) scale({zoom})"
			onpointerdown={down}
			onpointermove={move}
			onpointerup={up}
			onpointercancel={up}
		>
			{#if overlapSrc}
				<OverlapStrip src={overlapSrc} label="" />
			{/if}
			<div class="paper">
				<canvas bind:this={canvas} width={SECTION_WIDTH} height={SECTION_HEIGHT}></canvas>
				{#if !isLast}
					<div class="zone" style:height="{(OVERLAP_HEIGHT / SECTION_HEIGHT) * 100}%">
						<span>Seen by the next acolyte</span>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<footer>
		<div class="tools" role="toolbar" aria-label="Pencil">
			{#each TIPS as option (option.id)}
				<button
					type="button"
					class="tool"
					aria-label="{option.label} {erasing ? 'eraser' : 'tip'}"
					aria-pressed={tip === option}
					onclick={() => (tip = option)}
				>
					<!-- Hollow while erasing: the next stroke takes away rather than lays down. -->
					<svg viewBox="0 0 24 24" aria-hidden="true">
						{#if erasing}
							<path d={MARK} stroke-width={option.mark + 2} />
							<path class="hollow" d={MARK} stroke-width={option.mark} />
						{:else}
							<path d={MARK} stroke-width={option.mark} />
						{/if}
					</svg>
				</button>
			{/each}
			<button
				type="button"
				class="tool apart"
				aria-label="Eraser"
				aria-pressed={erasing}
				onclick={() => (erasing = !erasing)}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16l8-8 6 6-6 6H8zM10 20h10" /></svg>
			</button>
			<button
				type="button"
				class="tool apart"
				aria-label="Reset zoom"
				onclick={resetZoom}
				disabled={!zoomed}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5M8 10.5h5" />
				</svg>
			</button>
		</div>

		<button class="btn solid block" type="button" onclick={finish} disabled={!touched}>
			Lay down the pencil
		</button>
	</footer>
</div>

<style>
	.wrap {
		position: relative;
		min-height: 0;
		margin: 1rem var(--pad);
		display: grid;
		place-items: center;
		overflow: hidden;
	}

	.sheet {
		display: grid;
		touch-action: none;
		cursor: crosshair;
		transform-origin: 0 0;
	}

	.sheet :global(figcaption) {
		display: none;
	}

	.sheet :global(img) {
		pointer-events: none;
	}

	.paper {
		position: relative;
	}

	canvas {
		display: block;
		width: 100%;
		height: auto;
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
		font-size: var(--text-xs);
		letter-spacing: var(--tracking);
		text-transform: uppercase;
		color: var(--crimson);
		padding: 0.15rem 0.35rem;
		transform: translateY(-100%);
	}

	footer {
		display: grid;
		gap: 0.5rem;
		padding: 0.5rem var(--pad) 1rem;
		border-top: var(--line-faint);
	}

	.tools {
		display: flex;
		gap: 0.25rem;
		justify-content: center;
	}

	.tool {
		position: relative;
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--gray);
		cursor: pointer;
		transition:
			color 120ms linear,
			opacity 120ms linear;
	}

	.tool:hover,
	.tool[aria-pressed='true'] {
		color: var(--bone);
	}

	.tool:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.apart {
		margin-left: 0.75rem;
	}

	.tool .hollow {
		stroke: var(--black);
	}

	.tool::after {
		content: '';
		position: absolute;
		inset: 0.2rem;
		border-radius: 50%;
		box-shadow: 0 0 0 1px var(--bone);
		opacity: 0;
		transition: opacity 120ms linear;
	}

	.tool[aria-pressed='true']::after {
		opacity: 1;
	}

	.tool svg {
		width: 1.2rem;
		height: 1.2rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.25;
		stroke-linecap: round;
	}
</style>
