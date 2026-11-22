<!--
    src/features/library/blocks/Activity.svelte
    ─────────────────────────────────────────────────────────────────
      The Activity block: your streak, and every day you logged or finished something.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { activityStats } from "../../core/views";
    import type { OvBlock } from "../blocks";
    import Heat from "./Heat.svelte";

    let { c }: { c: OvBlock } = $props();

    const st = $derived((void c, activityStats()));
</script>

<p class="hint" style="margin:-4px 0 8px">{st.streak} day streak · longest {st.longest}</p><Heat byDay={st.byDay} weeks={22} />
