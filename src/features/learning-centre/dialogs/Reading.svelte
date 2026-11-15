<!--
    src/features/learning-centre/dialogs/Reading.svelte
    ─────────────────────────────────────────────────────────────────
      One book in a course (a card on its map, or a line in Next): where it's at, its copy in your library, what it
      needs first and what it unlocks, its parts, and editing it (title, author, year, topic, level, optional,
      reference only, ★ one of the best), or removing it. Which book is the dialog's state (ui.modal.pid, .bid; .edit
      opens Edit, .confirm asks before removing).
      The boxes save as they change, and "Add" a condition is this one's own; marking it, adding it to your library,
      removing a condition or a part, opening another book and removing it stay with pathClick (learning.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { items, markDirty, MEDIA, statusWord, ticked, titleOf } from "../../core/core";
    import { all } from "../../core/views";
    import { renderMain } from "../../core/shell";
    import { idFromOption } from "../../core/navigation";
    import DialogHead from "../../core/dialog/DialogHead.svelte";
    import {
        BOOK_LEVELS,
        isPwBookModal,
        lcSub,
        lvlOf,
        pwBook,
        pwBucket,
        pwCondText,
        pwLabel,
        pwLib,
        pwMark,
        pwMet,
        pwPartDone,
        PW_ST,
        pwState,
        pwUnlocks,
        PW_WORD,
        topicName,
    } from "../learning";
    import { lvlName, topicOptions } from "../pages/look";
    import type { Course, PathBook } from "../../core/model";

    const v = $derived.by(() => {
        const m = store.ui.modal;
        if (!isPwBookModal(m)) return null;
        void store.items;
        void store.meta;
        const C = lcSub(m.pid),
            b = C ? pwBook(C, m.bid) : undefined;
        if (!C || !b) return { gone: true as const }; // a literal (as const), so v.gone tells the two shapes apart
        pwMark(C);
        const lid = pwLib(b),
            L = lid ? items.get(lid) : null,
            others = C.books.filter(x => x.id !== b.id);
        return {
            gone: false as const,
            m: { bid: m.bid, edit: !!m.edit, confirm: !!m.confirm },
            b: { ...b, parts: (b.parts || []).map((x, i) => ({ t: x.t, done: pwPartDone(b, i) })) },
            bk: pwBucket(C, b),
            st: pwState(b),
            course: C.name,
            topic: topicName(C, b),
            also: (b.tops || []).map(t => C.topics.find(x => x.id === t)?.name).filter(Boolean),
            lvl: lvlOf(b),
            topics: topicOptions(C),
            lib: L && lid ? { id: lid, title: titleOf(L), status: statusWord(L.status, "book") } : null,
            conds: (b.after || []).map(c => ({ met: pwMet(C, c), text: pwCondText(C, c) })),
            others: others.map(x => ({ id: x.id, label: pwLabel(x) })),
            parted: others.some(x => x.parts),
            unlocks: pwUnlocks(C, b).map(x => ({ id: x.id, label: pwLabel(x) })),
            books: all()
                .filter(x => x.medium === "book")
                .sort((a, c) => titleOf(a).localeCompare(titleOf(c)))
                .map(x => `${titleOf(x)} · ${MEDIA[x.medium].one}`),
        };
    });
    // Edit is open as the dialog opens on a book if it asks for it, and then as you leave it
    let editOpen = $state(false),
        editFor = "";
    $effect.pre(() => {
        if (v && !v.gone && v.m.bid !== editFor) {
            editFor = v.m.bid;
            editOpen = v.m.edit;
        }
    });
    // the book and its course, as they are now, to change
    function current(): { C: Course; b: PathBook } | null {
        const m = store.ui.modal;
        if (!isPwBookModal(m)) return null;
        const C = lcSub(m.pid),
            b = C ? pwBook(C, m.bid) : undefined;
        return C && b ? { C, b } : null;
    }
    function saved() {
        markDirty();
        renderMain();
    }
    const TEXT = ["t", "a", "year"] as const; // as const: its names are the type of what text() may change
    function text(f: (typeof TEXT)[number], value: string) {
        const c = current();
        if (!c) return;
        c.b[f] = value.trim() || (f === "year" ? "" : c.b[f] || "");
        if (f === "t" || f === "a") delete c.b.lib;
        saved();
    }
    function flag(f: "opt" | "ref" | "top", box: HTMLInputElement) {
        const c = current();
        if (!c) return;
        c.b[f] = ticked(box) || undefined;
        saved();
    }
    function set(change: (b: PathBook) => void) {
        const c = current();
        if (!c) return;
        change(c.b);
        saved();
    }
    let condK = $state(""),
        condS = $state("done"),
        part = $state("");
    function addCond() {
        const c = current();
        if (!c) return;
        const s = condS || "done";
        if (condK && condK !== c.b.id && !(c.b.after || []).some(x => x.k === condK)) {
            c.b.after = [...(c.b.after || []), { k: condK, s, p: s === "part" ? 0 : undefined }];
            saved();
        }
    }
    function addPart() {
        const t = part.trim();
        if (!t) return;
        set(b => (b.parts = [...(b.parts || []), { t, done: false }]));
        part = "";
    }
    function linkLib(value: string) {
        const iid = idFromOption(value);
        if (iid) set(b => (b.lib = iid));
    }
</script>

{#if v && v.gone}<DialogHead title="Book" /><p class="hint">This book was removed.</p>{:else if v}
    {@const b = v.b}
    <div class="pwmodal"><DialogHead title={b.t} />
        <p class="hint">{b.a || ""}{b.year ? " · " + b.year : ""} · <span class="pwpill {v.bk}">{PW_WORD[v.bk]}</span> · {v.topic}{v.also.length ? ` (also ${v.also.join(", ")})` : ""} · {lvlName(v.lvl)}{b.opt ? " · optional" : ""}</p>
        <div class="bar"><div class="seg">{#each PW_ST as [k, l]}<button data-act="pw-st" data-k={k} aria-pressed={v.st === k}>{l}</button>{/each}</div></div>
        {#if v.lib}<p class="hint">In your library as <button class="linkbtn" data-act="open" data-id={v.lib.id}>{v.lib.title}</button> ({v.lib.status}). Marking it here updates it there too.</p>{:else}<div class="bar"><span class="hint">Not in your library: starting it adds it.</span><button class="btn sm" data-act="pw-tolib">Add to my library now</button><input class="inp" list="pw-libs" placeholder="…or link a book you already have" data-pwlink="1" style="flex:1" onchange={e => linkLib(e.currentTarget.value)}><datalist id="pw-libs">{#each v.books as o}<option value={o}></option>{/each}</datalist></div>{/if}
        <div class="pwcols">
            <div><p class="label">Needs first</p>{#if v.conds.length}<ul class="pwconds">{#each v.conds as c, i}<li class={c.met ? "met" : ""}>{c.met ? "✓" : "○"} {c.text} <button class="linkbtn" data-act="pw-cond-del" data-k={i} aria-label="Remove">✕</button></li>{/each}</ul>{:else}<p class="hint">Nothing: start it any time.</p>{/if}
                <div class="bar"><select class="sel" id="pw-cond-k" aria-label="Needs" bind:value={condK}><option value="">Add: needs…</option>{#each v.others as o (o.id)}<option value={o.id}>{o.label}</option>{/each}</select><select class="sel" id="pw-cond-s" aria-label="…to be" bind:value={condS}><option value="done">done</option><option value="start">underway</option>{#if v.parted}<option value="part">part 1 done</option>{/if}</select><button class="btn sm" data-act="pw-cond-add" onclick={addCond}>Add</button></div></div>
            <div><p class="label">Unlocks</p>{#if v.unlocks.length}<ul class="pwconds">{#each v.unlocks as x (x.id)}<li><button class="linkbtn" data-act="pw-book" data-k={x.id}>{x.label}</button></li>{/each}</ul>{:else}<p class="hint">Nothing waits on this one.</p>{/if}</div>
        </div>
        <p class="label">Parts</p><div class="topics">{#each b.parts as x, i}<label class="topic{x.done ? ' on' : ''}"><input type="checkbox" data-pwpart={i} checked={x.done} onchange={e => { const box = e.currentTarget; set(r => { if (r.parts && r.parts[i]) r.parts[i].done = ticked(box); }); }}>{x.t}<button class="linkbtn" data-act="pw-part-del" data-k={i} aria-label="Remove">✕</button></label>{/each}<input class="inp" placeholder="+ part or chapter" data-pwpartadd="1" style="max-width:220px" bind:value={part} onchange={addPart} onkeydown={e => { if (e.key === "Enter") { e.preventDefault(); addPart(); } }}></div>
        <details bind:open={editOpen}><summary class="hint">Edit</summary><div class="pwedit">
            <label class="ctl">Title <input class="inp" data-pwb="t" value={b.t} onchange={e => text("t", e.currentTarget.value)}></label><label class="ctl">Author <input class="inp" data-pwb="a" value={b.a || ""} onchange={e => text("a", e.currentTarget.value)}></label><label class="ctl">Year <input class="inp" data-pwb="year" value={b.year || ""} style="width:80px" onchange={e => text("year", e.currentTarget.value)}></label>
            <label class="ctl">Topic <select class="sel" data-pwbtopic="1" value={b.topic || ""} onchange={e => { const t = e.currentTarget.value; set(r => (r.topic = t || undefined)); }}><option value="">Other</option>{#each v.topics as o (o.id)}<option value={o.id}>{o.name}</option>{/each}</select></label>
            <label class="ctl">Level <select class="sel" data-pwblvl="1" value={String(v.lvl)} onchange={e => { const l = Number(e.currentTarget.value); set(r => (r.lvl = l)); }}>{#each BOOK_LEVELS as l (l)}<option value={String(l)}>{lvlName(l)}</option>{/each}</select></label>
            <label class="ctl"><input type="checkbox" data-pwbc="opt" checked={!!b.opt} onchange={e => flag("opt", e.currentTarget)}> Optional</label><label class="ctl"><input type="checkbox" data-pwbc="ref" checked={!!b.ref} onchange={e => flag("ref", e.currentTarget)}> Reference only</label><label class="ctl"><input type="checkbox" data-pwbc="top" checked={!!b.top} onchange={e => flag("top", e.currentTarget)}> ★ One of the best</label>
            {#if v.m.confirm}<button class="btn sm danger" data-act="pw-rm-yes">Remove from {v.course}</button><button class="btn sm ghost" data-act="pw-rm-no" onclick={() => store.dialog({ confirm: false })}>Keep</button>{:else}<button class="btn sm ghost danger" data-act="pw-rm" onclick={() => store.dialog({ confirm: true })}>Remove from {v.course}</button>{/if}</div></details></div>
{/if}
