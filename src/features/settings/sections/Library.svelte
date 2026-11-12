<!--
    src/features/settings/sections/Library.svelte
    ─────────────────────────────────────────────────────────────────
      Settings › Library: shelves as rows or sections, density, and what each type is called
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import Group from "../parts/Group.svelte";
    import Row from "../parts/Row.svelte";
    import Seg from "../parts/Seg.svelte";
    import { applyDensity } from "../../core/navigation";
    import KindTypes from "../parts/KindTypes.svelte";

    // copies, so a change shows: the older code changes these objects in place (see store.svelte.ts)
    const L = $derived({ ...store.meta.layout });
    const S = $derived({ ...store.meta.settings });
</script>

<h2 class="sh">Library</h2>
<p class="hint scopehint">For every mode. A mode's own view, grouping and sort come from its library (⋯ → “Make this the default”) or Settings › Modes.</p>
<Group title="Shelves">
    <Row label="Show shelves as" hint="Rows: each shelf is one line you scroll sideways, like a streaming service. Sections: each shelf wraps onto as many lines as it needs.">
        <Seg label="Show shelves as" options={[["sections", "Sections"], ["rows", "Rows"]]} value={L.shelfRows ? "rows" : "sections"}
            onpick={k => store.updateMeta(m => (m.layout.shelfRows = k === "rows"))} />
    </Row>
    <Row label="Density">
        <Seg label="Density" options={[["comfortable", "Comfortable"], ["compact", "Compact"]]} value={String(S.density || "comfortable")}
            onpick={k => {
                store.updateMeta(m => (m.settings.density = k));
                applyDensity();
            }} />
    </Row>
</Group>
<Group title="Types">
    <KindTypes />
    {#if !store.ui.typesAll}<button class="linkbtn" onclick={() => store.go({ typesAll: true })}>Show every kind of thing, not just what you have</button>{/if}
    <p class="hint">Types come from what's in your library and grow with it. Rename one, or fold one into another (ONA and OVA sit with anime series by default); what each thing is stored as never changes, so you can split them back out any time. Which types a mode shows: Settings › Modes.</p>
</Group>
<Group title="Seasons and sequels" open={false}>
    <p class="hint">Combining seasons, the season shown on the front, and scoring seasons separately are on the <button class="linkbtn" data-act="tab" data-k="rank">Rank</button> page, where you see them all at once.</p>
</Group>
