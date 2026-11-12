<!--
    src/features/watch-read/player/Controls.svelte
    ─────────────────────────────────────────────────────────────────
      The player's own controls on the video: the scrub bar (what has loaded, where you are, hover for the time, drag or
      click to go there, ← → on it), then the buttons you've put on the video, and, in cinema mode, the ones you've put
      under it. While you arrange the player, each row is a place to drop a button. What moves as the video plays is
      drawn by pcDraw in player.ts, not here.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { pcScrub } from "../player";
    import Tool from "./Tool.svelte";
    import { toolsAt, type PlayerView } from "./view";

    let {
        v,
        cinema,
        edit,
        drag,
    }: { v: PlayerView; cinema: boolean; edit: boolean; drag: { k: string | null; zone: string | null } } = $props();

    const on = $derived(toolsAt(v, "video"));
    const under = $derived(cinema ? toolsAt(v, "under") : []);
</script>

<div class="pc" data-zone="video"><div class="pc-scrub" role="slider" aria-label="Seek" tabindex="0" aria-valuemin="0" aria-valuenow="0" {@attach pcScrub}><span class="pc-buf"></span><span class="pc-done"></span><span class="pc-knob"></span><span class="pc-tip" hidden></span></div>{" "}<div class="pc-row wz{drag.zone === 'video' ? ' over' : ''}" data-zone="video">{#each on as k (k)}<Tool {k} {v} wrap={edit ? "titled" : ""} dragging={drag.k === k} />{/each}</div>{#if under.length || (edit && cinema)}<div class="pc-row wz under{drag.zone === 'under' ? ' over' : ''}" data-zone="under">{#each under as k (k)}<Tool {k} {v} wrap={edit ? "titled" : ""} dragging={drag.k === k} />{/each}</div>{/if}</div>
