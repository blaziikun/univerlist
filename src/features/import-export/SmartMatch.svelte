<!--
    src/features/import-export/SmartMatch.svelte
    ─────────────────────────────────────────────────────────────────
      Matching your list: each row of a pasted list or a CSV is looked up online (smartimport.ts), and this shows how
      far it's got, what wasn't found (fix the spelling and look again, or tick it to add as typed) and what was matched
      (with the ones worth a look first). Import brings the matches, what's already here and what you ticked; the rows
      and the ticks are the dialog's state (ui.modal.rows, .add), which the lookup fills in as it goes.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../core/store.svelte";
    import { fmtScore, norm, plural } from "../core/core";
    import DialogHead from "../core/dialog/DialogHead.svelte";
    import Pic from "../core/dialog/Pic.svelte";
    import { isSmartModal, oneOf, smartRetry, type SmartRow } from "./smartimport";

    const v = $derived.by(() => {
        const m = store.ui.modal;
        if (!isSmartModal(m)) return null;
        const R = m.rows.map(x => ({ ...x }));
        return { m: { ...m, add: { ...m.add } }, R, at: (x: SmartRow) => R.indexOf(x) };
    });
    // the titles you've corrected, and the rows being looked up again
    let typed = $state<Record<number, string>>({});
    let again = $state<Record<number, boolean>>({});
    function retry(i: number) {
        const m = store.ui.modal;
        if (!isSmartModal(m)) return;
        again[i] = true;
        smartRetry(m, i, typed[i] ?? m.rows[i]?.title ?? "");
    }
    // a row back from being looked up again can be tried once more
    $effect.pre(() => {
        if (!v) return;
        for (const k of Object.keys(again)) if (v.R[Number(k)]?.state) delete again[Number(k)];
    });
</script>

{#if v}
    {@const { m, R } = v}
    {@const lib = R.filter(x => x.state === "library")}
    {@const ok = R.filter(x => x.state === "matched")}
    {@const none = R.filter(x => x.state === "none")}
    {@const wait = R.filter(x => !x.state)}
    {@const done = m.done || 0}
    {@const unsure = ok.filter(x => !x.sure).length}
    <DialogHead title={"Matching your list · " + (m.from || "")} />
    <div class="smprog"><div class="prog"><span style="width:{R.length ? Math.round((done / R.length) * 100) : 100}%"></span></div><span class="hint">{m.running ? `Looking up ${done} of ${R.length}…` : `Looked up all ${R.length}`} · {plural(ok.length, "match", "matches")} · {lib.length} already in your library · {none.length} not found{wait.length && !m.running ? ` · ${wait.length} not looked up` : ""}</span></div>
    {#if none.length}<div class="panel smnone"><h3>Not found online · {none.length}</h3><p class="hint">Fix the spelling and look again, or tick the ones to add exactly as typed. Nothing here is added unless you tick it.</p>
        <div class="bar"><button class="linkbtn" data-act="sm-addall">Tick all</button><button class="linkbtn" data-act="sm-addnone">Untick all</button></div>
        {#each none as x}{@const i = v.at(x)}<div class="smrow"><label class="ctl"><input type="checkbox" data-smadd={i} checked={!!m.add[i]} aria-label="Add as typed" onchange={e => store.dialog({ add: { ...m.add, [i]: e.currentTarget.checked } })}></label><input class="inp" data-smtitle={i} value={typed[i] ?? x.title} oninput={e => (typed[i] = e.currentTarget.value)}><span class="hint">{oneOf(x.medium)}{x.year ? " · " + x.year : ""}</span><button class="btn sm" data-act="sm-retry" data-k={i} disabled={!!again[i]} onclick={() => retry(i)}>Look again</button></div>{/each}</div>{/if}
    {#if ok.length}<details class="panel" open={!!unsure}><summary><h3>Matched · {ok.length}{#if unsure}{" "}<span class="hint">· {unsure} worth a look</span>{/if}</h3></summary><div class="smlist">{#each ok.sort((a, b) => Number(!!a.sure) - Number(!!b.sure)) as x}{@const i = v.at(x)}{@const r = x.match}{#if r}<div class="smrow{x.sure ? '' : ' unsure'}"><span class="pc">{#if r.cover}<Pic src={r.cover} loading="lazy" />{/if}</span>
            <span class="t"><b>{r.title}</b><small>{[r.year, r.kind || oneOf(r.medium || x.medium), r.creator].filter(Boolean).join(" · ")}{norm(r.title) !== norm(x.title) ? ` · you typed “${x.title}”` : ""}</small></span>
            {#if x.rating}<span class="hint">{fmtScore(x.rating, x.scale || undefined)}</span>{/if}<button class="btn sm ghost" data-act="sm-unmatch" data-k={i} title="Not this one">✕</button></div>{/if}{/each}</div></details>{/if}
    <div class="bar" style="margin-top:12px"><button class="btn gold" data-act="sm-import" disabled={!!m.running && !ok.length && !lib.length}>Import {ok.length + lib.length + none.filter(x => m.add[v.at(x)]).length}{m.running ? " (stop looking)" : ""}</button>
        <button class="btn ghost" data-act="sm-raw">Import everything as typed</button></div>
    <p class="hint">Your scores, statuses, dates and notes are kept exactly; a match only brings the title, picture, year and links. Scores keep the scale they were given in.</p>
{/if}
