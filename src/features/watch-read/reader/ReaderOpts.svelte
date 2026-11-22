<!--
    src/features/watch-read/reader/ReaderOpts.svelte
    ─────────────────────────────────────────────────────────────────
      The reader's settings (⚙), remembered separately for manga, manhwa, comics, picture files and books. Pictures:
      page by page (direction, one or two pages, the cover on its own, fit, click anywhere for the next) or one long
      scroll (width, gaps, auto-scroll speed), and zoom. Books: the page's colours, font, size, spacing, line length,
      justified text. Background and brightness for pictures; the progress bar and logging for everything. A choice
      draws the reader at once (readerSet in read.ts); a slider a moment after you stop (readerRange). The keys at the foot.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { stageNews } from "../stage-state.svelte";
    import { readerOptsView, readerRange, readerSet, readerTick } from "../read";

    const v = $derived.by(() => {
        void stageNews.reader;
        return readerOptsView();
    });
    // the sliders as you drag them, shown beside them before the reader draws again
    let slid = $state<Record<string, number>>({});
    $effect.pre(() => {
        void v;
        slid = {};
    });
    const val = (k: keyof typeof v.o) => slid[k] ?? Number(v.o[k]);
    function slide(k: keyof typeof v.o, x: number) {
        slid = { ...slid, [k]: x };
        readerRange(k, x);
    }
</script>

{#snippet seg(k: "mode" | "rtl" | "spread" | "fit" | "theme" | "font" | "bg", opts: [string, string][])}<div class="seg">{#each opts as [x, l] (x)}<button data-act="rd-set" data-k={k} data-v={x} aria-pressed={String(v.o[k]) === x} onclick={() => readerSet(k, x)}>{l}</button>{/each}</div>{/snippet}
{#snippet rng(k: "width" | "gap" | "scrollSpeed" | "zoom" | "size" | "line" | "measure" | "bright", l: string, a: number, b: number, st: number, unit: string)}<label class="ctl rng">{l + " "}<input type="range" min={a} max={b} step={st} data-ro={k} value={v.o[k]} oninput={e => slide(k, +e.currentTarget.value)}><output>{val(k) + unit}</output></label>{/snippet}
{#snippet chk(k: "coverAlone" | "tapNext" | "justify" | "showBar" | "autoLog", l: string)}<label class="ctl"><input type="checkbox" data-ro={k} checked={!!v.o[k]} onchange={e => readerTick(k, e.currentTarget.checked)}>{" " + l}</label>{/snippet}
<div class="cin-opts panel rd-opts"><p class="ilab">{"Reader · " + v.word + " "}<span class="hint">{"(remembered for all " + v.all + ")"}</span></p>{" "}{#if v.pics}<div class="rdo-row"><span>Layout</span>{@render seg("mode", [["paged", "Page by page"], ["scroll", "One long scroll"]])}</div>{" "}{#if v.paged}<div class="rdo-row"><span>Direction</span>{@render seg("rtl", [["true", "Right to left"], ["false", "Left to right"]])}</div>{" "}<div class="rdo-row"><span>Pages</span>{@render seg("spread", [["single", "One"], ["double", "Two side by side"], ["auto", "Two when wide"]])}</div>{#if v.o.spread !== "single"}{@render chk("coverAlone", "First page on its own")}{/if}{" "}<div class="rdo-row"><span>Fit</span>{@render seg("fit", [["both", "Whole page"], ["width", "Width"], ["height", "Height"], ["original", "Actual size"]])}</div>{@render chk("tapNext", "Click anywhere to go to the next page")}{:else}{@render rng("width", "Width", 360, 1800, 20, " px")}{@render rng("gap", "Gap between pages", 0, 60, 2, " px")}{@render rng("scrollSpeed", "Auto-scroll speed", 10, 400, 10, " px/s")}{/if}{" "}{@render rng("zoom", "Zoom", 50, 300, 10, "%")}{" "}{/if}{#if v.book}<div class="rdo-row"><span>Page</span>{@render seg("theme", [["dark", "Dark"], ["sepia", "Sepia"], ["light", "Light"]])}</div>{" "}<div class="rdo-row"><span>Font</span>{@render seg("font", [["serif", "Serif"], ["sans", "Sans"], ["mono", "Mono"]])}</div>{" "}{@render rng("size", "Text size", 12, 36, 1, " px")}{@render rng("line", "Line spacing", 1.1, 2.4, 0.1, "")}{@render rng("measure", "Line length", 380, 1100, 20, " px")}{@render chk("justify", "Justified text")}{" "}{/if}{#if !v.book}<div class="rdo-row"><span>Background</span>{@render seg("bg", v.bgs)}</div>{@render rng("bright", "Brightness", 40, 120, 5, "%")}{" "}{/if}{@render chk("showBar", "Show the progress bar")}{@render chk("autoLog", "Log my progress when I reach the end")}{" "}<p class="hint">Keys: ← → pages · space / shift-space · Home / End · + − zoom · D two pages · A auto-scroll · F full screen · Esc close</p></div>
