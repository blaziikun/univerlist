<!--
    src/features/learning-centre/pages/PathModule.svelte
    ─────────────────────────────────────────────────────────────────
      One module of a pathway. Closed, it shows what matters at a glance: its name, credits, term, core or option, its
      mark and status, what it waits on, its topics' progress and spread over the course's areas, and its readings in
      order. Open (lc-open), it's edited in place: its details, its topics ("Topic < what it needs" adds one that
      waits), the modules it needs first, where else its topics are taught, fetching its reading list, linking a book
      from your library, adding a reading, and removing it. moduleLook() in look.ts works out what it shows.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { items, markDirty, ticked } from "../../core/core";
    import { idFromOption } from "../../core/navigation";
    import type { PathModule, Pathway } from "../../core/model";
    import { acId, lcMod, lcPath } from "../learning";
    import { LC_STATUS, moduleLook, pwCardLook } from "./look";
    import PwCard from "./PwCard.svelte";

    let {
        P,
        m,
        open,
        lib,
        addRead,
    }: {
        P: Pathway;
        m: PathModule;
        open: string | null | undefined;
        lib: string[];
        addRead: (e: KeyboardEvent & { currentTarget: HTMLInputElement }, mid: string) => void;
    } = $props();

    const v = $derived(moduleLook(P, m, open));
    const stageOpts = $derived([["", "No stage"], ...(P.stages || []).map((s): [string, string] => [s.id, s.name])]);

    /** this module, live, to change */
    const live = () => {
        const Q = lcPath(P.id);
        return Q ? lcMod(Q, m.id) : undefined;
    };
    // its details: an empty name keeps the one it had
    function set(f: "status" | "name" | "code" | "credits" | "term" | "grade" | "stage", value: string) {
        const md = live();
        if (!md) return;
        md[f] = f === "name" ? value.trim() || md.name : value.trim();
        markDirty();
    }
    function core(box: HTMLInputElement) {
        const md = live();
        if (!md) return;
        md.core = ticked(box);
        markDirty();
    }
    function topic(i: number, box: HTMLInputElement) {
        const x = (live()?.topics || [])[i];
        if (!x) return;
        x.done = ticked(box);
        markDirty();
    }
    // Enter adds a topic; "Topic < Other, Another" adds one that waits for those
    function addTopic(e: KeyboardEvent & { currentTarget: HTMLInputElement }) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const md = live(),
            [tn, need = ""] = e.currentTarget.value.trim().split(/\s*<\s*/),
            after = need.split(/\s*,\s*/).filter(Boolean);
        if (!md || !tn || (md.topics || []).some(x => x.t === tn)) return;
        md.topics = [...(md.topics || []), { t: tn, done: false, ...(after.length ? { after } : {}) }];
        e.currentTarget.value = "";
        markDirty();
    }
    function needs(id: string, box: HTMLInputElement) {
        const md = live();
        if (!md) return;
        md.after = ticked(box) ? [...new Set([...(md.after || []), id])] : (md.after || []).filter(x => x !== id);
        if (!md.after.length) delete md.after;
        markDirty();
    }
    // a book from your library, picked from the list, joins the module's readings
    function link(box: HTMLInputElement) {
        const Q = lcPath(P.id),
            iid = idFromOption(box.value),
            it = iid && items.get(iid);
        if (!Q || !iid || !it) return;
        Q.books.push({ id: "b" + acId(), t: it.title, a: it.creator || "", mod: m.id, th: "", st: "todo", note: "", after: [], lib: iid });
        box.value = "";
        markDirty();
    }
</script>

<div class={v.cls} style="--th:{v.colour}"><div class="lcmh">
    <button class="lcmt" data-act="lc-open" data-k={m.id} aria-expanded={v.open}><b>{v.name}</b><small>{v.facts}</small></button>
    <select class="sel" data-lcm={m.id} data-f="status" aria-label="Status" value={m.status || "planned"} onchange={e => set("status", e.currentTarget.value)}>{#each LC_STATUS as [k, l]}<option value={k}>{l}</option>{/each}</select>
    <span class="lcrb h"><button class="linkbtn" data-act="lc-mod-up" data-k={m.id} aria-label="Move up">↑</button><button class="linkbtn" data-act="lc-mod-down" data-k={m.id} aria-label="Move down">↓</button></span></div>
    {#if v.waits.length}<p class="lcwait">Waits on {#each v.waits as w, i (i + w)}{i ? ", " : ""}<b>{w}</b>{/each}</p>{/if}
    {#if v.bar != null}<div class="prog"><span style="width:{v.bar}%"></span></div>{/if}{#if v.spread}<span class="lcspread" title={v.spread.title}>{#each v.spread.parts as x, i (i + x.a)}<i style="flex:{x.n};background:{x.colour}"></i>{/each}</span>{/if}
    {#if v.open}<div class="lcmb"><div class="bar"><input class="inp" data-lcm={m.id} data-f="name" value={m.name} placeholder="Name" style="flex:2;min-width:180px" aria-label="Name" onchange={e => set("name", e.currentTarget.value)}><input class="inp" data-lcm={m.id} data-f="code" value={m.code || ""} placeholder="Code" style="width:100px" aria-label="Code" onchange={e => set("code", e.currentTarget.value)}>
        <input class="inp" data-lcm={m.id} data-f="credits" value={m.credits || ""} placeholder="Credits" style="width:76px" aria-label="Credits" onchange={e => set("credits", e.currentTarget.value)}><input class="inp" data-lcm={m.id} data-f="term" value={m.term || ""} placeholder="Term" style="width:96px" aria-label="Term" onchange={e => set("term", e.currentTarget.value)}><input class="inp" data-lcm={m.id} data-f="grade" value={m.grade ?? ""} placeholder="Mark %" style="width:76px" aria-label="Mark" onchange={e => set("grade", e.currentTarget.value)}>
        <label class="ctl"><input type="checkbox" data-lcm={m.id} data-f="core" checked={m.core !== false} onchange={e => core(e.currentTarget)}> Core</label>{#if (P.stages || []).length}<select class="sel" data-lcm={m.id} data-f="stage" aria-label="Stage" value={m.stage || ""} onchange={e => set("stage", e.currentTarget.value)}>{#each stageOpts as [k, l], i (i + k)}<option value={k}>{l}</option>{/each}</select>{/if}</div>
        <p class="label">Topics · {v.td}/{v.topics.length} <span class="hint">in reading order · "Topic &lt; what it needs" to add one that waits</span></p><div class="topics">{#each v.topics as t, i (i + t.t)}<label class="topic{t.done ? ' on' : ''}{t.wait ? ' wait' : ''}" title={t.title}><input type="checkbox" data-lctopic={m.id} data-i={i} checked={t.done} onchange={e => topic(i, e.currentTarget)}>{t.t}<button class="linkbtn" data-act="lc-topic-del" data-k={m.id} data-i={i} aria-label="Remove">✕</button></label>{/each}
            <input class="inp" placeholder="+ topic (press Enter)" data-lctopicadd={m.id} style="width:190px" onkeydown={addTopic}></div>
        {#if v.others.length}<p class="label">Needs first <span class="hint">modules to finish before this one</span></p><div class="topics">{#each v.others as x, i (i + x.id)}<label class="topic{x.on ? ' on' : ''}"><input type="checkbox" data-lcmafter={m.id} data-k={x.id} checked={x.on} onchange={e => needs(x.id, e.currentTarget)}>{x.name}</label>{/each}</div>{/if}
        {#if v.equiv.length}<details><summary class="hint">Where else this is taught</summary><ul class="equiv">{#each v.equiv as x, i (i + x.t)}<li><b>{x.t}</b>: {x.where}</li>{/each}</ul></details>{/if}
        <div class="bar"><button class="btn sm ghost" data-act="lc-import" data-k={P.id} data-m={m.id}>Fetch its reading list…</button><input class="inp" list="lc-libs" placeholder="Link a book from your library…" data-lclink={m.id} style="flex:1" onchange={e => link(e.currentTarget)}><datalist id="lc-libs">{#each lib as o, i (i + o)}<option value={o}></option>{/each}</datalist>
            <button class="btn sm ghost danger" data-act="lc-mod-del" data-k={m.id}>Remove module</button></div></div>{/if}
    {#if v.reads.length || v.open}<ol class="lcreads">{#each v.reads as b, i (i + b.id)}<li><PwCard c={pwCardLook(P, b)} /><span class="lcrb"><button class="linkbtn" data-act="lc-read-up" data-k={b.id} aria-label="Earlier">↑</button><button class="linkbtn" data-act="lc-read-down" data-k={b.id} aria-label="Later">↓</button></span></li>{/each}</ol>{/if}
    {#if v.open}<div class="bar lcadd"><input class="inp" placeholder="+ reading: title, author (press Enter)" data-lcaddread={m.id} onkeydown={e => addRead(e, m.id)}></div>{/if}</div>
