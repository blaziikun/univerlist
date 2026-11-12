<!--
    src/features/learning-centre/dialogs/Reading.svelte
    ─────────────────────────────────────────────────────────────────
      One reading on a course's pathway (a book's card on it): where it's at, its copy in your library, what it waits
      for and what it unlocks, its parts, notes, and editing it (title, author, module, thread, optional, reference only,
      free online, crème de la crème, best for self-study), or removing it. Which reading is the dialog's state
      (ui.modal.pid, .bid; .edit opens Edit, .confirm asks before removing).
      The boxes save as they change, and "Add" a condition is this one's own; marking it read, adding it to your
      library, removing a condition or a part, opening another reading and removing it change your library and stay
      with pathClick (learning.ts).
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
        isPwBookModal,
        lcLane,
        lcMod,
        pwBook,
        pwBucket,
        pwColor,
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
        PWS,
    } from "../learning";
    import type { PathBook, Pathway } from "../../core/model";

    const v = $derived.by(() => {
        const m = store.ui.modal;
        if (!isPwBookModal(m)) return null;
        void store.items;
        void store.meta;
        const P = PWS().find(p => p.id === m.pid),
            b = P ? pwBook(P, m.bid) : undefined;
        if (!P || !b) return { gone: true as const }; // a literal (as const), so v.gone tells the two shapes apart
        pwMark(P);
        const lid = pwLib(b),
            L = lid ? items.get(lid) : null,
            md = lcMod(P, b.mod),
            others = P.books.filter(x => x.id !== b.id);
        return {
            gone: false as const,
            m: { bid: m.bid, edit: !!m.edit, confirm: !!m.confirm },
            b: { ...b, parts: (b.parts || []).map((x, i) => ({ t: x.t, done: pwPartDone(b, i) })) },
            colour: pwColor(P, lcLane(P, b)),
            bk: pwBucket(P, b),
            st: pwState(b),
            mod: md ? [md.code, md.name].filter(Boolean).join(" ") : "",
            lib: L && lid ? { id: lid, title: titleOf(L), status: statusWord(L.status, "book") } : null,
            conds: (b.after || []).map(c => ({ met: pwMet(P, c), text: pwCondText(P, c) })),
            others: others.map(x => ({ id: x.id, label: pwLabel(x) })),
            parted: others.some(x => x.parts),
            unlocks: pwUnlocks(P, b).map(x => ({ id: x.id, label: pwLabel(x) })),
            modules: (P.modules || []).map(x => ({ id: x.id, name: [x.code, x.name].filter(Boolean).join(" ") })),
            books: all()
                .filter(x => x.medium === "book")
                .sort((a, c) => titleOf(a).localeCompare(titleOf(c)))
                .map(x => `${titleOf(x)} · ${MEDIA[x.medium].one}`),
        };
    });
    // Edit is open as the dialog opens on a reading if it asks for it (a new reading), and then as you leave it
    let editOpen = $state(false),
        editFor = "";
    $effect.pre(() => {
        if (v && !v.gone && v.m.bid !== editFor) {
            editFor = v.m.bid;
            editOpen = v.m.edit;
        }
    });
    // the reading and its pathway, as they are now, to change
    function current(): { P: Pathway; b: PathBook } | null {
        const m = store.ui.modal;
        if (!isPwBookModal(m)) return null;
        const P = PWS().find(p => p.id === m.pid),
            b = P ? pwBook(P, m.bid) : undefined;
        return P && b ? { P, b } : null;
    }
    function saved() {
        markDirty();
        renderMain();
    }
    const TEXT = ["note", "t", "a", "year", "th"] as const; // as const: its names are the type of what text() may change
    function text(f: (typeof TEXT)[number], value: string) {
        const c = current();
        if (!c) return;
        c.b[f] = f === "note" ? value : value.trim() || (f === "th" || f === "year" ? "" : c.b[f] || "");
        if (f === "t" || f === "a") delete c.b.lib;
        saved();
    }
    function flag(f: "opt" | "ref" | "free" | "top" | "self", box: HTMLInputElement) {
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
        condS = $state("start"),
        part = $state("");
    function addCond() {
        const c = current();
        if (!c) return;
        const s = condS || "start";
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

{#if v && v.gone}<DialogHead title="Reading" /><p class="hint">This reading was removed.</p>{:else if v}
    {@const b = v.b}
    <div class="pwmodal" style="--th:{v.colour}"><DialogHead title={b.t} />
        <p class="hint">{b.a || ""}{b.year ? " · " + b.year : ""} · <span class="pwpill {v.bk}">{PW_WORD[v.bk]}</span>{v.mod ? ` · ${v.mod}` : ""}{b.free ? " · free online" : ""}{b.opt ? " · optional" : ""}</p>
        {#if b.where}<p class="pwwhere"><span class="label">Where it's taught</span> {b.where}</p>{/if}
        <div class="bar"><div class="seg">{#each PW_ST as [k, l]}<button data-act="pw-st" data-k={k} aria-pressed={v.st === k}>{l}</button>{/each}</div></div>
        {#if v.lib}<p class="hint">In your library as <button class="linkbtn" data-act="open" data-id={v.lib.id}>{v.lib.title}</button> ({v.lib.status}). Marking it here updates it there too.</p>{:else}<div class="bar"><button class="btn sm" data-act="pw-tolib">Add to my library</button><input class="inp" list="pw-libs" placeholder="…or link a book you already have" data-pwlink="1" style="flex:1" onchange={e => linkLib(e.currentTarget.value)}><datalist id="pw-libs">{#each v.books as o}<option value={o}></option>{/each}</datalist></div>{/if}
        <div class="pwcols">
            <div><p class="label">Starts once</p>{#if v.conds.length}<ul class="pwconds">{#each v.conds as c, i}<li class={c.met ? "met" : ""}>{c.met ? "✓" : "○"} {c.text} <button class="linkbtn" data-act="pw-cond-del" data-k={i} aria-label="Remove">✕</button></li>{/each}</ul>{:else}<p class="hint">Nothing: start it any time.</p>{/if}
                <div class="bar"><select class="sel" id="pw-cond-k" aria-label="Starts once" bind:value={condK}><option value="">Add: once…</option>{#each v.others as o (o.id)}<option value={o.id}>{o.label}</option>{/each}</select><select class="sel" id="pw-cond-s" aria-label="…is" bind:value={condS}><option value="start">is underway</option><option value="done">is done</option>{#if v.parted}<option value="part">part 1 is done</option>{/if}</select><button class="btn sm" data-act="pw-cond-add" onclick={addCond}>Add</button></div></div>
            <div><p class="label">Unlocks</p>{#if v.unlocks.length}<ul class="pwconds">{#each v.unlocks as x (x.id)}<li><button class="linkbtn" data-act="pw-book" data-k={x.id}>{x.label}</button></li>{/each}</ul>{:else}<p class="hint">Nothing waits on this one.</p>{/if}</div>
        </div>
        <p class="label">Parts</p><div class="topics">{#each b.parts as x, i}<label class="topic{x.done ? ' on' : ''}"><input type="checkbox" data-pwpart={i} checked={x.done} onchange={e => { const box = e.currentTarget; set(r => { if (r.parts && r.parts[i]) r.parts[i].done = ticked(box); }); }}>{x.t}<button class="linkbtn" data-act="pw-part-del" data-k={i} aria-label="Remove">✕</button></label>{/each}<input class="inp" placeholder="+ part or chapter" data-pwpartadd="1" style="max-width:220px" bind:value={part} onchange={addPart} onkeydown={e => { if (e.key === "Enter") { e.preventDefault(); addPart(); } }}></div>
        <p class="label">Notes</p><textarea class="inp" data-pwb="note" rows="3" placeholder="What to watch out for, which exercises, where you are" value={b.note || ""} onchange={e => text("note", e.currentTarget.value)}></textarea>
        <details bind:open={editOpen}><summary class="hint">Edit</summary><div class="pwedit">
            <label class="ctl">Title <input class="inp" data-pwb="t" value={b.t} onchange={e => text("t", e.currentTarget.value)}></label><label class="ctl">Author <input class="inp" data-pwb="a" value={b.a || ""} onchange={e => text("a", e.currentTarget.value)}></label><label class="ctl">Year <input class="inp" data-pwb="year" value={b.year || ""} style="width:80px" onchange={e => text("year", e.currentTarget.value)}></label>
            <label class="ctl">Module <select class="sel" data-pwbmod="1" value={b.mod || ""} onchange={e => { const mod = e.currentTarget.value; set(r => (r.mod = mod)); }}><option value="">None</option>{#each v.modules as o (o.id)}<option value={o.id}>{o.name}</option>{/each}</select></label>
            <label class="ctl">Thread <input class="inp" data-pwb="th" value={b.th || ""} placeholder="its module, by default" onchange={e => text("th", e.currentTarget.value)}></label>
            <label class="ctl"><input type="checkbox" data-pwbc="opt" checked={!!b.opt} onchange={e => flag("opt", e.currentTarget)}> Optional</label><label class="ctl"><input type="checkbox" data-pwbc="ref" checked={!!b.ref} onchange={e => flag("ref", e.currentTarget)}> Reference only</label><label class="ctl"><input type="checkbox" data-pwbc="free" checked={!!b.free} onchange={e => flag("free", e.currentTarget)}> Free online</label><label class="ctl"><input type="checkbox" data-pwbc="top" checked={!!b.top} onchange={e => flag("top", e.currentTarget)}> ★ Crème de la crème</label><label class="ctl"><input type="checkbox" data-pwbc="self" checked={!!b.self} onchange={e => flag("self", e.currentTarget)}> Best for self-study</label>
            {#if v.m.confirm}<button class="btn sm danger" data-act="pw-rm-yes">Remove from path</button><button class="btn sm ghost" data-act="pw-rm-no" onclick={() => store.dialog({ confirm: false })}>Keep</button>{:else}<button class="btn sm ghost danger" data-act="pw-rm" onclick={() => store.dialog({ confirm: true })}>Remove from path</button>{/if}</div></details></div>
{/if}
