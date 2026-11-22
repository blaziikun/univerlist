<!--
    src/features/library/blocks/Summary.svelte
    ─────────────────────────────────────────────────────────────────
      The Summary block: how many things are in this mode, finished, in progress, the time spent, your mean score and
      what you've finished this year. The first time you open a mode's overview, the numbers count up.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { fmtScore, minutesSpent, STATUS_WORDS, ui } from "../../core/core";
    import { groupWord } from "../../core/views";
    import { activeOf, countUpOnce, type OvBlock } from "../blocks";
    import CountUp from "./CountUp.svelte";

    let { c }: { c: OvBlock } = $props();

    // only the first time you open a mode's overview, not every time something changes
    const run = countUpOnce(ui.mode + (ui.private ? "p" : ""));
    const v = $derived.by(() => {
        const fin = c.M.filter(b => b.status === "done"),
            rated = c.M.filter(b => b.rating),
            yr = new Date().getFullYear(),
            mins = c.M.reduce((a, b) => a + minutesSpent(b), 0),
            W = STATUS_WORDS[groupWord()];
        return {
            n: c.M.length,
            fin: fin.length,
            active: activeOf(c.M).length,
            days: mins >= 1440,
            spent: mins >= 1440 ? (mins / 1440).toFixed(1) : Math.round(mins / 60),
            mean: rated.length ? fmtScore(rated.reduce((a, b) => a + (b.rating || 0), 0) / rated.length) : "–",
            year: fin.filter(b => b.finishedAt && new Date(b.finishedAt).getFullYear() === yr).length,
            yr,
            W,
        };
    });
</script>

<div class="sumtiles">
    <button class="tile" data-act="tab" data-k="library"><div class="v"><CountUp v={v.n} {run} /></div><div class="k">In {c.mode.name}</div></button>
    <button class="tile" data-act="lib-status" data-k="done"><div class="v"><CountUp v={v.fin} {run} /></div><div class="k">{v.W.done}</div></button>
    <button class="tile" data-act="lib-status" data-k="active"><div class="v"><CountUp v={v.active} {run} /></div><div class="k">{v.W.active}</div></button>
    <div class="tile"><div class="v"><CountUp v={v.spent} fmt={v.days ? "1" : ""} {run} /></div><div class="k">{v.days ? "Days" : "Hours"} spent</div></div>
    <div class="tile"><div class="v">{v.mean}</div><div class="k">Mean score</div></div>
    <div class="tile"><div class="v"><CountUp v={v.year} {run} /></div><div class="k">{v.W.done} in {v.yr}</div></div></div>
