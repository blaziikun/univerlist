<!--
    src/features/learning-centre/dialogs/FetchFromLink.svelte
    ─────────────────────────────────────────────────────────────────
      Fetch from a link: a programme's page, a module list or a reading list (or its text, pasted), then a table of
      what was found to check, fix, reorder and untick, then saved into the pathway (or one of its modules), or, from
      Curricula, as a programme to compare. Where it's from and what's been found are the dialog's state (ui.modal:
      pid, mid or cur, step, rows, into, chain, toLib); what's typed (the link, the pasted text) is this one's own.
      Reading the page (lcRead and the parsers) and saving (lcSave) are in learning-import.ts: a fetched page or pasted
      text is someone else's, read row by row into plain text; nothing is saved until the second step.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { renderOverlay } from "../../core/modals";
    import DialogHead from "../../core/dialog/DialogHead.svelte";
    import { lcMod, lcMove, PWS } from "../learning";
    import { isLcImportModal, lcFetch, lcPaste, lcSave, lcSections, ROW_TEXT, type RowText } from "../learning-import";
    import type { LcImportModal } from "../learning-import";
    import type { PathModule } from "../../core/model";

    const v = $derived.by(() => {
        const m = store.ui.modal;
        if (!isLcImportModal(m)) return null;
        void store.meta;
        const P: { modules?: PathModule[] } | undefined = m.cur ? { modules: [] } : PWS().find(p => p.id === m.pid);
        if (!P) return { gone: true as const }; // a literal (as const), so v.gone tells the two shapes apart
        const mod = lcMod(P, m.mid),
            rows = (m.rows || []).map(r => ({ ...r }));
        return {
            gone: false as const,
            m: { ...m },
            mod: mod ? [mod.code, mod.name].filter(Boolean).join(" ") : "",
            mods: (P.modules || []).map(x => ({ id: x.id, name: [x.code, x.name].filter(Boolean).join(" ") })),
            rows,
            sections: lcSections(rows),
        };
    });
    const open = store.ui.modal;
    let url = $state(isLcImportModal(open) ? open.url || "" : ""),
        text = $state(isLcImportModal(open) ? open.text || "" : ""),
        uni = $state(isLcImportModal(open) ? open.uni || "" : ""),
        pname = $state(isLcImportModal(open) ? open.pname || "" : "");
    // the dialog as it is now, with what's typed for a programme to compare kept on it
    function live(): LcImportModal | null {
        const m = store.ui.modal;
        if (!isLcImportModal(m)) return null;
        if (m.cur) {
            m.uni = uni.trim();
            m.pname = pname.trim();
        }
        return m;
    }
    function row(i: number, f: RowText | "core" | "keep", value: string | boolean) {
        const m = live(),
            r = m && (m.rows || [])[i];
        if (!m || !r) return;
        if (f === "core" || f === "keep") r[f] = !!value;
        else if (ROW_TEXT.includes(f)) r[f] = String(value).trim();
        store.dialog({ rows: m.rows }, m);
    }
    function move(i: number, d: number) {
        const m = live();
        if (!m) return;
        lcMove(m.rows || [], i, d);
        store.dialog({ rows: m.rows }, m);
    }
    function back() {
        const m = live();
        if (!m) return;
        m.step = "link";
        m.err = "";
        renderOverlay(true);
    }
    // the box for pasted text opens once fetching has failed, and then stays as you leave it
    let pasteOpen = $state(false);
    $effect.pre(() => {
        if (v && !v.gone && (v.m.paste || v.m.err)) pasteOpen = true;
    });
    const word = (n: number, isM: boolean) => (isM ? (n === 1 ? "module" : "modules") : n === 1 ? "reading" : "readings");
    // what each box in the table is, for a screen reader (the column's heading)
    const CELL: Record<RowText, string> = { stage: "Stage", code: "Code", name: "Module", credits: "Credits", section: "Section", t: "Title", a: "Author", year: "Year", imp: "Importance" };
    const IMP: [string, string][] = [
        ["", "–"],
        ["core", "Essential"],
        ["rec", "Recommended"],
        ["opt", "Further"],
    ];
</script>

{#if v && v.gone}<DialogHead title="Fetch" /><p class="hint">That course was removed.</p>{:else if v}
    {@const m = v.m}
    {#if m.step !== "review"}
        <DialogHead title={v.mod ? `Reading list for ${v.mod}` : m.cur ? "Fetch a programme to compare" : "Fetch from a link"} />
        {#if m.cur}<div class="fields"><div class="field"><label for="lci-uni">University</label><input id="lci-uni" placeholder="e.g. Cambridge" bind:value={uni}></div><div class="field"><label for="lci-pname">Programme</label><input id="lci-pname" placeholder="e.g. Part III (MASt)" bind:value={pname}></div></div>{/if}
        <!-- svelte-ignore a11y_autofocus: the link is what you came to give -->
        <div class="fields"><div class="field full"><label for="lci-url">Link</label><input id="lci-url" placeholder={v.mod ? "the module's reading list (Talis Aspire, Leganto or the module page)" : "the programme's page, a module list, or a reading list"} autofocus bind:value={url}></div></div>
        {#if !(v.mod || m.cur)}<div class="seg" role="group" aria-label="What it is">{#each [["auto", "Work it out"], ["modules", "Modules"], ["readings", "A reading list"]] as [k, l]}<button data-act="lci-kind" data-k={k} aria-pressed={(m.want || "auto") === k} onclick={() => store.dialog({ want: k, url })}>{l}</button>{/each}</div>{/if}
        <div class="bar" style="margin-top:10px"><button class="btn gold" data-act="lci-fetch" disabled={!!m.busy} onclick={() => { const l = live(); if (l) lcFetch(l, url); }}>{#if m.busy}<span class="spin"></span>Fetching…{:else}Fetch{/if}</button></div>
        {#if m.err}<p class="err">{m.err}</p>{/if}
        <details bind:open={pasteOpen}><summary class="hint">Or paste the page's text (for a page that can't be fetched, or needs you to sign in)</summary>
            <textarea class="inp" id="lci-text" rows="8" placeholder="Open the page, select everything (Ctrl/⌘ + A), copy, and paste here" bind:value={text}></textarea>
            <div class="bar"><button class="btn" data-act="lci-paste" onclick={() => { const l = live(); if (l) lcPaste(l, text); }}>Read this</button></div></details>
        <p class="hint">Nothing is saved until you've checked it on the next step. Fetching goes through your site's /api, which only reaches university and reading-list sites.</p>
    {:else}
        {@const R = v.rows}
        {@const isM = m.found === "modules"}
        {@const n = R.filter(r => r.keep).length}
        <DialogHead title={isM ? "Modules found" : "Readings found"} />
        <p class="hint">{R.length ? `${R.length} found${m.how ? " (" + m.how + ")" : ""}. Untick what you don't want, fix anything that's wrong, reorder with ↑↓.` : "Nothing recognisable was found on that page. Try pasting its text instead, or add them by hand."}</p>
        {#if R.length}<div class="tablewrap lcimp"><table class="lib small"><thead><tr><th></th>{#if isM}<th>Stage</th><th>Code</th><th>Module</th><th>Credits</th><th>Core</th>{:else}{#if v.sections.length}<th>Section</th>{/if}<th>Title</th><th>Author</th><th>Year</th><th>Importance</th>{/if}<th></th></tr></thead><tbody>
            {#each R as r, i}<tr class={r.keep ? "" : "off"}><td><input type="checkbox" data-lcikeep={i} checked={r.keep} aria-label="Keep" onchange={e => row(i, "keep", e.currentTarget.checked)}></td>
                {#if isM}<td>{@render cell(i, r, "stage", "110px", "Year 1")}</td><td>{@render cell(i, r, "code", "90px")}</td><td>{@render cell(i, r, "name", "100%; min-width:240px")}</td><td>{@render cell(i, r, "credits", "56px")}</td><td><input type="checkbox" data-lci={i} data-f="core" checked={r.core !== false} aria-label="Core" onchange={e => row(i, "core", e.currentTarget.checked)}></td>{:else}{#if v.sections.length}<td>{@render cell(i, r, "section", "120px")}</td>{/if}<td>{@render cell(i, r, "t", "100%; min-width:260px")}</td><td>{@render cell(i, r, "a", "170px")}</td><td>{@render cell(i, r, "year", "56px")}</td><td><select class="sel" data-lci={i} data-f="imp" aria-label="Importance" value={r.imp || ""} onchange={e => row(i, "imp", e.currentTarget.value)}>{#each IMP as [k, l]}<option value={k}>{l}</option>{/each}</select></td>{/if}
                <td class="nowrap"><button class="linkbtn" data-act="lci-up" data-k={i} aria-label="Up" onclick={() => move(i, -1)}>↑</button><button class="linkbtn" data-act="lci-down" data-k={i} aria-label="Down" onclick={() => move(i, 1)}>↓</button></td></tr>{/each}</tbody></table></div>{/if}
        {#if !isM && R.length}<div class="bar">{#if v.mod}<span class="hint">Into <b>{v.mod}</b></span>{:else}<label class="ctl">Put them <select class="sel" id="lci-into" value={m.into ?? (v.sections.length ? "@sections" : "")} onchange={e => store.dialog({ into: e.currentTarget.value })}>{#if v.sections.length}<option value="@sections">under a module per section</option>{/if}<option value="">outside any module</option>{#each v.mods as x (x.id)}<option value={x.id}>under {x.name}</option>{/each}</select></label>{/if}
            <label class="ctl"><input type="checkbox" id="lci-chain" checked={m.chain !== false} onchange={e => store.dialog({ chain: e.currentTarget.checked })}> Read in this order (each waits for the one before to be underway)</label>
            <label class="ctl"><input type="checkbox" id="lci-lib" checked={!!m.toLib} onchange={e => store.dialog({ toLib: e.currentTarget.checked })}> Also add them to my library, as planned</label></div>{/if}
        <div class="bar" style="margin-top:10px"><button class="btn gold" data-act="lci-save" disabled={!n} onclick={() => { const l = live(); if (l) lcSave(l); }}>Add {n} {word(n, isM)}</button><button class="btn ghost" data-act="lci-back" onclick={back}>← Another link</button></div>
    {/if}
{/if}

{#snippet cell(i: number, r: Record<string, unknown>, f: RowText, w: string, ph = "")}<input class="inp" data-lci={i} data-f={f} aria-label={CELL[f]} value={String(r[f] || "")} placeholder={ph} style="width:{w}" onchange={e => row(i, f, e.currentTarget.value)}>{/snippet}
