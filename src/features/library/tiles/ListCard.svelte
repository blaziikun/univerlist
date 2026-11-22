<!--
    src/features/library/tiles/ListCard.svelte
    ─────────────────────────────────────────────────────────────────
      A list's card: a ranking's first five pictures, a tier list's tiers, or any other list's first covers, with its
      name and how much is in it. Opens the list; what it shows comes from listCardLook() in connect.ts.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Pic from "../../core/dialog/Pic.svelte";
    import { listCardLook } from "../connect";
    import Cover from "./Cover.svelte";

    let { c }: { c: ReturnType<typeof listCardLook> } = $props();
</script>

{#if c.kind === "rank"}<button class="lcard tiercard" data-act="go-list" data-k={c.id}><span class="rkprev">{#each c.pics as src, i (i)}{#if src}<Pic {src} loading="lazy" />{:else}<span class="noimg"></span>{/if}{/each}</span><span class="t">{c.title}</span><span class="hint">{c.note}</span></button>{:else if c.kind === "tier"}<button class="lcard tiercard" data-act="go-list" data-k={c.id}><span class="tprev">{#each c.tiers as r, i (i)}<span style={r.style}>{r.label}</span>{/each}</span><span class="t">{c.title}</span><span class="hint">{c.note}</span></button>{:else}<button class="lcard" data-act="go-list" data-k={c.id}><span class="lcov">{#each c.covers as b, i (i)}<Cover {b} />{/each}</span><span class="t">{c.title}</span><span class="hint">{c.note}</span></button>{/if}
