<!--
    src/features/import-export/ColumnMatch.svelte
    ─────────────────────────────────────────────────────────────────
      Match the columns of a CSV no site is known for: which column is the title, the year, the score…, the medium,
      what scores are out of, and the status for rows without one, with the first rows as they'd come in. Import
      ("cm-import", import-export/handlers.ts) looks each row up. The choices are the dialog's state (ui.modal.map,
      .medium, .scale, .status); the matching itself is importers.ts's (guessMapping, mapRows).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../core/store.svelte";
    import { fmtDate, MEDIA, MEDIA_KEYS, STATUS, STATUS_WORDS, statusWord } from "../core/core";
    import DialogHead from "../core/dialog/DialogHead.svelte";
    import { guessMapping, MAP_FIELDS, mapRows } from "./importers";

    const v = $derived.by(() => {
        const m = store.ui.modal;
        if (!m || m.kind !== "csvmap" || !m.preview) return null;
        const columns = m.preview.columns || [],
            rows = m.preview.rows || [],
            map = m.map || guessMapping(columns),
            med = m.medium || "film";
        return { m: { ...m }, name: m.preview.name, columns, rows, map, med, sample: mapRows(rows.slice(0, 5), map, { medium: med, scale: m.scale || "auto", status: m.status || "done", all: rows }) };
    });
    // the columns are guessed once, then they're yours to change
    $effect.pre(() => {
        if (v && !v.m.map) store.dialog({ map: v.map });
    });
    function column(k: string, c: string) {
        if (!v) return;
        const map = { ...v.map };
        if (c) map[k] = c;
        else delete map[k];
        store.dialog({ map });
    }
</script>

{#snippet choose(id: string, opts: [string, string][], val: string, set: (v: string) => void)}<select class="sel" {id} onchange={e => set(e.currentTarget.value)}>{#each opts as [k, l]}<option value={k} selected={k === val}>{l}</option>{/each}</select>{/snippet}
{#if v}
    {@const { m, map, med } = v}
    <DialogHead title={"Match the columns · " + v.name} />
    <p class="hint">{v.rows.length} rows. Tell UniverList which column is which; anything left blank is skipped.</p>
    <div class="bar"><label class="ctl">Medium {@render choose("cm-medium", MEDIA_KEYS.map((k): [string, string] => [k, MEDIA[k].name]), med, x => store.dialog({ medium: x }))}</label>
        <label class="ctl">Scores are out of {@render choose("cm-scale", [["auto", "Work it out"], ["10", "10"], ["5", "5 (stars)"], ["100", "100"]], m.scale || "auto", x => store.dialog({ scale: x }))}</label>
        <label class="ctl">Rows without a status are {@render choose("cm-status", STATUS.map((k): [string, string] => [k, STATUS_WORDS[MEDIA[med].group][k]]), m.status || "done", x => store.dialog({ status: x }))}</label></div>
    <div class="mapgrid">{#each MAP_FIELDS as [k, l]}<label class="ctl"><span>{l}</span><select class="sel" data-map={k} onchange={e => column(k, e.currentTarget.value)}><option value="">—</option>{#each v.columns as c}<option selected={map[k] === c}>{c}</option>{/each}</select></label>{/each}</div>
    {#if v.sample.length}<div class="tablewrap"><table class="lib small"><thead><tr><th>Title</th><th>Year</th><th>Score</th><th>Status</th><th>Finished</th></tr></thead><tbody>{#each v.sample as x}<tr><td>{x.title}</td><td class="num">{x.year || ""}</td><td class="num">{x.rating || ""}</td><td>{statusWord(x.status, med)}</td><td>{x.finishedAt ? fmtDate(x.finishedAt) : ""}</td></tr>{/each}</tbody></table></div>{:else}<p class="err">Pick the title column first.</p>{/if}
    <div class="bar"><button class="btn gold" data-act="cm-import" disabled={!map.title}>Import {v.rows.length}</button></div>
{/if}
