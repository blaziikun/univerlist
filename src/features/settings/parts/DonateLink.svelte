<!--
    src/features/settings/parts/DonateLink.svelte
    ─────────────────────────────────────────────────────────────────
      The quiet support link: at the foot of Settings, and in the corner of every page (main.ts puts that one in
      #donatefoot; it hides under the player and the reader). Nothing when the app has no address for it.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { APP_NAME, DONATE_URL, safeUrl } from "../../core/core";

    let { cls = "" }: { cls?: string } = $props();
    const url = safeUrl(DONATE_URL);
</script>

{#if url}<a class="donate {cls}" href={url} target="_blank" rel="noopener">{`♥ Support ${APP_NAME}`}</a>{/if}
