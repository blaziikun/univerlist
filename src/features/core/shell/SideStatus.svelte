<!--
    src/features/core/shell/SideStatus.svelte
    ─────────────────────────────────────────────────────────────────
      The sidebar's footer: only what needs saying (not saving, offline, a library file to reconnect), the shortcuts,
      and Customise, which ticks the sections the sidebar shows (its ticks are its own). Drawn when the older code asks
      (renderSideStatus, renderSide in core/shell.ts), with what sideStatusView() there works out.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { markDirty, meta, ticked } from "../core";
    import { renderSide, SIDE_HIDE_DEFAULT, sideStatusView } from "../shell";
    import { shellNews } from "./shell-state.svelte";

    const v = $derived.by(() => {
        void shellNews.side;
        return sideStatusView();
    });
    function show(k: string, box: HTMLInputElement) {
        const L = meta.layout.side,
            H = new Set(L.hide || SIDE_HIDE_DEFAULT);
        if (ticked(box)) H.delete(k);
        else H.add(k);
        L.hide = [...H];
        markDirty();
        renderSide();
    }
</script>

{#if v.warn}<p class="swarn">{v.warn.pre}{#if v.warn.reconnect}<button class="linkbtn" data-act="file-reconnect">Reconnect {v.warn.reconnect}</button>{/if}{v.warn.post}</p>{/if}
    <div class="sfrow"><button class="sfl" data-act="go-settings" data-k="keys">Shortcuts</button><span class="pop"><button class="sfl" data-act="pop" data-k="sidecust" aria-expanded={v.pop}>Customise</button>{#if v.pop}<div class="popbody up">{" "}<p class="label">Show in the sidebar</p>{#each v.secs as s (s.k)}<label class="ctl"><input type="checkbox" data-sidesec={s.k} checked={s.on} onchange={e => show(s.k, e.currentTarget)}> {s.l}</label>{/each}</div>{/if}</span></div>
