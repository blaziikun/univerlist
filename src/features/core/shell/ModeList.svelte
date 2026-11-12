<!--
    src/features/core/shell/ModeList.svelte
    ─────────────────────────────────────────────────────────────────
      The profile header's mode menu: every mode (its key, colour and count), Watch & read, the private collection,
      and Edit modes (modeListView in core/shell.ts). The buttons go through mode, go-stage, private-toggle and
      go-settings.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../store.svelte";
    import { curMode } from "../core";
    import { modeListView } from "../shell";
    import { shellNews } from "./shell-state.svelte";

    const v = $derived.by(() => {
        void store.ui;
        void shellNews.side;
        return modeListView(curMode());
    });
</script>

<div class="modemenu" role="menu">{#each v.modes as m (m.id)}<button role="menuitem" data-act="mode" data-k={m.id} aria-current={m.on} style={m.mc}><span class="mg">{m.g}</span><span class="mn">{m.name}</span><span class="ct">{m.n}</span>{#if m.key}<kbd>{m.key}</kbd>{/if}</button>{/each}
    <div class="msep"></div>{#if v.stage}<button role="menuitem" data-act="go-stage"><span class="mg">▶</span><span class="mn">Watch & read <span class="beta">beta</span></span></button>{/if}
    <button role="menuitem" data-act="private-toggle"><span class="mg">{v.priv ? "↩" : "🔒"}</span><span class="mn">{v.priv ? "Leave the private collection" : "Private collection"}</span></button>
    <button role="menuitem" data-act="go-settings" data-k="modes"><span class="mg">✎</span><span class="mn">Edit modes</span></button></div>
