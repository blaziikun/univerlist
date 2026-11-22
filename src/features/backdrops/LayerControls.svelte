<!--
    src/features/backdrops/LayerControls.svelte
    ─────────────────────────────────────────────────────────────────
      One layer of moving shapes in the backdrop you're editing: what shape, what colour, how many, how they move
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { type Layer, SHAPES } from "./backdrop";

    let { layer = $bindable(), n, onremove }: { layer: Layer; n: number; onremove: () => void } = $props();

    const NAMES: Record<string, string> = {
        dot: "Dots",
        star: "Stars",
        heart: "Hearts",
        square: "Squares",
        triangle: "Triangles",
        ring: "Rings",
        petal: "Petals",
        streak: "Rain streaks",
    };
    // the sliders: [field, label, min, max, step, how to show the value]
    const SLIDERS: [keyof Layer, string, number, number, number, (v: number) => string][] = [
        ["count", "How many", 1, 300, 1, v => String(v)],
        ["size", "Size", 1, 60, 0.5, v => v + " px"],
        ["speed", "Speed", 0, 3, 0.05, v => (v ? v.toFixed(2) : "still")],
        ["angle", "Direction", 0, 360, 5, v => way(v)],
        ["wobble", "Sway", 0, 1, 0.05, v => Math.round(v * 100) + "%"],
        ["twinkle", "Twinkle", 0, 1, 0.05, v => Math.round(v * 100) + "%"],
        ["opacity", "Strength", 0.05, 1, 0.05, v => Math.round(v * 100) + "%"],
        ["depth", "Nearness", 0, 1, 0.05, v => Math.round(v * 100) + "%"],
    ];
    /** a direction in words: 90° is falling, 270° is rising */
    function way(d: number) {
        const w = ["right", "down and right", "down", "down and left", "left", "up and left", "up", "up and right"];
        return w[Math.round(d / 45) % 8];
    }
    const set = (k: keyof Layer, v: number) => (layer = { ...layer, [k]: v });
</script>

<fieldset class="wlayer">
    <legend>Layer {n}</legend>
    <div class="bar">
        <label class="ctl">Shape
            <select class="sel" value={layer.shape} onchange={e => (layer = { ...layer, shape: e.currentTarget.value as Layer["shape"] })}>
                {#each SHAPES as s (s)}<option value={s}>{NAMES[s]}</option>{/each}
            </select>
        </label>
        <label class="ctl">Colour
            <input type="color" value={layer.color === "accent" ? "#d4ad55" : layer.color} disabled={layer.color === "accent"} aria-label={`Layer ${n} colour`} onchange={e => (layer = { ...layer, color: e.currentTarget.value })} />
        </label>
        <label class="ctl"><input type="checkbox" checked={layer.color === "accent"} onchange={e => (layer = { ...layer, color: e.currentTarget.checked ? "accent" : "#ffffff" })} /> The theme's accent</label>
        <button class="btn sm ghost" onclick={onremove}>Remove layer</button>
    </div>
    <div class="wsliders">
        {#each SLIDERS as [k, l, a, b, st, show] (k)}
            <label class="ctl rangec"><span>{l}</span>
                <input type="range" min={a} max={b} step={st} value={layer[k] as number} oninput={e => set(k, +e.currentTarget.value)} />
                <output>{show(layer[k] as number)}</output>
            </label>
        {/each}
    </div>
</fieldset>

<style>
    .wlayer { border: 1px solid var(--line2); border-radius: var(--r-sm); padding: 10px 12px 12px; margin: 0 0 10px; }
    .wlayer legend { padding: 0 6px; font-weight: 600; }
    .wsliders { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 6px 16px; margin-top: 8px; }
</style>
