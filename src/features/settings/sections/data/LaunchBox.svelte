<!--
    src/features/settings/sections/data/LaunchBox.svelte
    ─────────────────────────────────────────────────────────────────
      LaunchBox boxes and spines, inside Your games (Settings › Data): choose LaunchBox's Metadata.zip and it's read in
      this browser (lbimport.ts). What's said under the button follows the reading as it goes (workNews.lb); the copy
      kept in this browser is looked for the first time this shows.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { onMount } from "svelte";
    import { store } from "../../../core/store.svelte";
    import { LB, lbForget, lbLookOnce, lbPick, lbView } from "../../../sources/lbimport";
    import { workNews } from "../../../sources/work-state.svelte";

    // the button follows the page, as it did; what's under it follows the reading too
    const busy = $derived.by(() => {
        void store.ui;
        void store.meta;
        void store.items;
        return LB.running;
    });
    const st = $derived.by(() => {
        void workNews.lb;
        void store.ui;
        void store.meta;
        void store.items;
        return lbView();
    });
    onMount(lbLookOnce);
</script>

<div class="lbpanel"><p class="label">LaunchBox boxes and spines</p><p class="hint">No key needed. 1. Download <a class="link" href="https://gamesdb.launchbox-app.com/Metadata.zip" target="_blank" rel="noopener">Metadata.zip ↗</a> (LaunchBox's whole database; it's large). 2. Choose it here. It's read in this browser and nothing is uploaded; only a slim list of picture addresses is kept.</p>{" "}<div class="bar"><button class="btn" data-act="lb-pick" disabled={busy} onclick={lbPick}>Choose Metadata.zip…</button></div><div id="lbstat">{#if st.k === "err"}<p class="err">{st.err}</p>{:else if st.k === "running"}<p class="hint">{`${st.phase} ${st.pct != null ? st.pct + "%" : ""}`}</p><div class="prog"><span style="width:{st.bar}%"></span></div>{:else if st.k === "done"}<p class="hint">{`Matched ${st.matched} of ${st.total} games. Their real box is now the cover (unless you'd picked one), spines are on the shelf, and the back and 3D box are in each card's Art.${st.kept ? " A slim copy is kept in this browser, so games you add from now on get theirs by themselves." : ""}`}</p>{:else if st.k === "kept"}<p class="hint">{`Kept in this browser: LaunchBox's database from ${st.at} (${st.n.toLocaleString()} games). New games get their boxes and spines by themselves; choose a newer Metadata.zip any time to refresh it. `}<button class="linkbtn" data-act="lb-forget" onclick={lbForget}>Forget it</button></p>{/if}</div></div>
