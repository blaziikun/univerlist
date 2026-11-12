<!--
    src/features/library/tiles/Cover.svelte
    ─────────────────────────────────────────────────────────────────
      A cover: the picture, or a made-up one (title, ornament, author or medium) while there's none or it won't load.
      What it shows is worked out by coverLook() in tiles.ts. A picture that won't load gets one more try through the
      image proxy, then gives way to the made-up cover.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { coverLook, coverRetry } from "./tiles";
    import { tilesWatch } from "./watch";
    import type { ItemDraft } from "../../core/model";

    let { b, cls = "" }: { b: ItemDraft; cls?: string } = $props();

    const look = $derived.by(() => {
        tilesWatch();
        return coverLook(b);
    });
    // the picture shown, after any retry through the proxy; "" once it has failed for good
    let tried = $state<{ for: string; src: string } | null>(null);
    const src = $derived(tried && tried.for === look.src ? tried.src : look.src);

    function failed() {
        tried = { for: look.src, src: tried && tried.for === look.src ? "" : coverRetry(look.src) };
    }
</script>

<div class="cover m-{look.medium}{src ? ' has-img' : ''} {cls}" style={look.style} aria-hidden="true"><div class="ct">{look.title}</div><div class="orn"></div><div class="ca">{look.foot}</div>{#if src}<img {src} alt="" loading="lazy" referrerpolicy="no-referrer" onerror={failed}>{/if}</div>
