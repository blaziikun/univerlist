<!--
    src/features/library/blocks/CountUp.svelte
    ─────────────────────────────────────────────────────────────────
      A number on the overview that counts up from nought when it's first shown (not with reduced motion), then shows
      itself as given.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { onMount } from "svelte";

    let { v, fmt = "", run = false }: { v: number | string; fmt?: string; run?: boolean } = $props();

    let t = $state(1); // how far through counting up, 0 to 1
    const end = $derived(parseFloat(String(v)));
    const shown = $derived(
        t >= 1 || !Number.isFinite(end) || end <= 0 ? String(v) : (end * (1 - (1 - t) ** 3)).toFixed(fmt === "1" ? 1 : 0)
    );
    onMount(() => {
        if (!run || !(end > 0) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        t = 0;
        const t0 = performance.now();
        let raf = 0;
        const tick = (now: number) => {
            t = Math.min(1, (now - t0) / 650);
            if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    });
</script>

<span class="cu" data-cu={v} data-fmt={fmt}>{shown}</span>
