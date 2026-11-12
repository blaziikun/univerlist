<!--
    src/features/library/stats/Log.svelte
    ─────────────────────────────────────────────────────────────────
      Stats › Log: every session, start and finish, by day, newest first, with the time each day took (logLook,
      core/views.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import MediumDot from "../tiles/MediumDot.svelte";
    import { store } from "../../core/store.svelte";
    import { logLook} from "../../core/views";

    const L = $derived.by(() => {
        void store.itemsByFrame;
        void store.meta;
        void store.ui;
        return logLook();
    });
</script>

{#each L as day (day.d)}<div class="panel" style="margin-bottom:10px"><h3>{day.date}<span class="r hint">{day.time}</span></h3>
    <div class="sessions">{#each day.events as e, i (i)}<div><MediumDot m={e.medium} /><b>{e.what}</b><button class="linkbtn" data-act="open" data-id={e.id}>{e.title}</button>{#if e.lane}<span>{e.lane}</span>{/if}</div>{/each}</div></div>{:else}<div class="empty"><h3>Nothing logged yet</h3><p>Use +1, +10 or "Set…" on anything in progress to log where you are.</p></div>{/each}
