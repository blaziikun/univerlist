<!--
    src/features/settings/parts/Matrix.svelte
    ─────────────────────────────────────────────────────────────────
      What a mode or one of its shelves shows (Settings › Modes): a row per medium, with a box for the whole medium and
      one for each of its types. Ticking a box works out what the grid now shows from what it showed (matrixRead in
      settings.ts), rather than reading every box back from the page, and saves it (matrixTick). The boxes keep their
      data-mm names ("mode|anime|TV", "shelf0|book|*") for the tests.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { MEDIA, MEDIA_KEYS } from "../../core/core";
    import { kindToggles, matrixRead, matrixTick } from "../settings";

    let { match, prefix, media = MEDIA_KEYS }: { match: string[]; prefix: string; media?: readonly string[] } = $props();

    const rows = $derived(
        media.map(m => {
            const t = kindToggles(match, m);
            return { m, name: MEDIA[m].name, all: t.filter(x => x[1]).length === t.length, t };
        })
    );
    const tick = (medium: string, kind: string, on: boolean) => matrixTick(prefix, matrixRead(match, media, medium, kind, on));
</script>

<div class="matrix">{#each rows as r (r.m)}<div class="mrow"><label class="ctl mm"><input type="checkbox" data-mm="{prefix}|{r.m}|*" checked={r.all} onchange={e => tick(r.m, "*", e.currentTarget.checked)}><b>{r.name}</b></label>{" "}<div class="chips">{#each r.t as [k, on] (k)}<label class="kchip{on ? ' on' : ''}"><input type="checkbox" data-mm="{prefix}|{r.m}|{k}" checked={on} onchange={e => tick(r.m, k, e.currentTarget.checked)}>{k || "No type"}</label>{/each}</div></div>{/each}</div>
