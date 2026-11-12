<!--
    src/features/core/dialog/Pic.svelte
    ─────────────────────────────────────────────────────────────────
      A picture from outside (a catalogue's cover, a character, a banner you linked). One that won't load gets one more
      try through the image proxy, as every picture the older code draws does (the error listener in core/events.ts),
      and then stays as it is. Anything else given (loading, class) goes on the <img>; it's sent without a referrer
      unless told otherwise (referrerpolicy={undefined}: a picture the HTML pages drew without that rule).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { HTMLImgAttributes } from "svelte/elements";
    import { coverRetry } from "../../library/tiles/tiles";

    let { src, ...rest }: { src: string } & Omit<HTMLImgAttributes, "src"> = $props();

    // the address after a retry through the proxy, for the picture it was tried for
    let tried = $state<{ for: string; src: string } | null>(null);
    const shown = $derived(tried && tried.for === src ? tried.src : src);
    function failed() {
        if (tried && tried.for === src) return;
        const again = coverRetry(src);
        if (again) tried = { for: src, src: again };
    }
</script>

<img src={shown} alt="" referrerpolicy="no-referrer" {...rest} onerror={failed}>
