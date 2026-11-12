<!--
    src/features/core/shell/TopBar.svelte
    ─────────────────────────────────────────────────────────────────
      The top bar: the sidebar's button (on the side the sidebar is), the logo (back to the overview), a tag in the
      private collection, Watch or Read on those pages; the busy light, search, Insights and Settings. Drawn when the
      older code asks (renderTop in core/shell.ts, shell-state.svelte.ts); what it shows comes from topView() there.
      Every button goes through its data-act (core/nav-handlers.ts, watch-read).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Icon from "../Icon.svelte";
    import { topView } from "../shell";
    import { busy, shellNews } from "./shell-state.svelte";
    import Logo from "./Logo.svelte";

    const v = $derived.by(() => {
        void shellNews.side;
        return topView();
    });
</script>

{#snippet sbtn()}<button class="ib sidebtn" data-act="side-toggle" aria-label="Sidebar" aria-pressed={v.pinned} title={v.sideTitle}><Icon name="side" /></button>{/snippet}
<div class="top{v.priv ? ' priv' : ''}"><div class="topl" id="top-l">{#if !v.right}{@render sbtn()}{/if}
    <button class="brand" data-act="go-mode" data-k={v.mode} title="Overview"><Logo l={v.logo} /></button>{#if v.priv}<span class="privtag">private</span>{/if}{#if v.stage}<div class="seg stageseg" role="group" aria-label="Watch or read">{#each [["watch", "Watch"], ["read", "Read"]] as [k, l] (k)}<button data-act="stage-switch" data-k={k} aria-pressed={v.stage === k}>{l}</button>{/each}</div>{/if}</div><div class="topr" id="top-r"><button class="busy{busy.warn ? ' warn' : ''}" id="busy" data-act="go-settings" data-k="data" hidden={!busy.on} title={busy.title}></button>
    <button class="ib" data-act="focus-search" title={v.searchTitle} aria-label="Search"><Icon name="search" /></button>
    <button class="ib" data-act="open-discover" title={v.insightsTitle} aria-label="Insights"><Icon name="spark" /></button>
    <button class="ib" data-act="settings-toggle" aria-label={v.inSet ? "Close settings" : "Settings"} title={v.setTitle} aria-pressed={v.inSet}><Icon name={v.inSet ? "x" : "gear"} /></button>{#if v.right}{@render sbtn()}{/if}</div></div>
