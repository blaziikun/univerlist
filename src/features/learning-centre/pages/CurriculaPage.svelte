<!--
    src/features/learning-centre/pages/CurriculaPage.svelte
    ─────────────────────────────────────────────────────────────────
      The Learning Centre's Curricula tab: what different programmes teach in one course, side by side. The course
      (ui.uniSub, or the first with programmes), the programmes you compare (each can be left out of the table or
      removed), pasting or fetching another, the topics, and then the merged table (CurTable) or each programme's
      modules side by side (ui.uniView). The course's Curricula is copied here each time anything changes, as the
      older code changes it in place; the parts below save to the real thing (curS).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { clone, markDirty, ticked } from "../../core/core";
    import HiddenNote from "../../core/page/HiddenNote.svelte";
    import { curS, curSid, uniData } from "../learning-curricula";
    import { ACS } from "../learning";
    import { courseName, curCourses, progAbbr } from "./look";
    import CurTopics from "./CurTopics.svelte";
    import CurPaste from "./CurPaste.svelte";
    import CurTable from "./CurTable.svelte";

    const v = $derived.by(() => {
        void store.itemsByFrame; // your library, taken in once a frame
        void store.meta;
        const u = store.ui,
            sid = curSid();
        if (!sid) return null;
        const L = curCourses(),
            cur = ACS().curricula || {},
            { S, books } = uniData(sid);
        return {
            sid,
            name: courseName(sid),
            chips: L.map(s => ({ id: s.id, name: s.name, n: (cur[s.id]?.progs || []).length })),
            S: clone(S),
            books: clone(books),
            view: u.uniView || "merged",
            paste: !!u.uniPaste,
            topics: !!u.uniTopics,
        };
    });
    const progs = $derived(v ? v.S.progs : []),
        shown = $derived(v ? progs.filter(p => !v.S.hide.includes(p.id)) : []);

    function hide(id: string, box: HTMLInputElement) {
        if (!v) return;
        const S = curS(v.sid);
        S.hide = ticked(box) ? S.hide.filter(x => x !== id) : [...new Set([...S.hide, id])];
        markDirty();
    }
</script>

<HiddenNote />
{#if !v}<div class="empty"><p>Add a course first.</p><p class="hint">Curricula compares what different programmes teach in one course, topic by topic.</p><button class="btn gold" data-act="tab" data-k="learn">Go to Courses</button></div>{:else}<div class="curr"><div class="unihead"><div class="chips">{#each v.chips as s, i (i + s.id)}<button class="chip" data-act="uni-sub" data-k={s.id} aria-pressed={s.id === v.sid}>{s.n ? s.name + " " : s.name}{#if s.n}<small>{s.n}</small>{/if}</button>{/each}</div><span class="spacer"></span>
        {#if progs.length}<div class="seg">{#each [["merged", "Merged"], ["side", "Side by side"]] as [k, l] (k)}<button data-act="uni-view" data-k={k} aria-pressed={v.view === k}>{l}</button>{/each}</div>{/if}
        <button class="btn sm" data-act="uni-paste">+ Paste a programme</button><button class="btn sm gold" data-act="uni-fetch" data-k={v.sid}>Fetch a programme…</button></div>
    {#if progs.length}<div class="uniprogs">{#each progs as p, i (i + p.id)}<label class="uniprog {p.kind || ''}{v.S.hide.includes(p.id) ? ' off' : ''}"><input type="checkbox" data-unihide={p.id} checked={!v.S.hide.includes(p.id)} onchange={e => hide(p.id, e.currentTarget)}><span class="ua">{progAbbr(progs, p)}</span><span title={p.why || ""}><b>{p.uni || ""}</b> {p.name}<small>{p.kind === "specialist" ? "Specialist · " : ""}{p.why || ""}</small></span><button class="linkbtn" data-act="uni-del" data-k={p.id} aria-label="Remove {p.name}">remove</button></label>{/each}</div>{/if}
    {#if v.paste}<CurPaste sid={v.sid} />{/if}{#if v.topics || !v.S.topics.length || !progs.length}<CurTopics sid={v.sid} S={v.S} />{:else}<p class="hint"><button class="linkbtn" data-act="uni-topics">Edit topics ({v.S.topics.length})</button></p>{/if}{#if !progs.length}<div class="empty"><p>Nothing compared in {v.name || "this course"} yet.</p><p class="hint">Add the topics you care about (or let the first programme you add create them), then add programmes: paste a module list, or fetch it from a university's page. Each module is matched to topics by name, and books set for it come with it.</p></div>{:else if v.view === "side"}<div class="uniside">{#each shown as p, i (i + p.id)}<section class="panel"><h3>{p.uni || ""} <small class="hint">{p.name}</small></h3>{#each p.modules as m, j (j)}<div class="unimod"><b>{m.core ? "★ " + m.name : m.name}</b><small>{(m.books || []).map(k => { const bk = v.books[Array.isArray(k) ? k[0] : k]; return bk ? bk[0] : ""; }).filter(Boolean).join(" · ")}</small></div>{/each}</section>{/each}</div>{:else}<CurTable sid={v.sid} S={v.S} {shown} abbr={p => progAbbr(progs, p)} books={v.books} />{/if}</div>{/if}
