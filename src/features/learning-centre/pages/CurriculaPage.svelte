<!--
    src/features/learning-centre/pages/CurriculaPage.svelte
    ─────────────────────────────────────────────────────────────────
      The Learning Centre's Curricula tab, for the current course: each programme it was built from, side by side, as
      modules → the topics each teaches → its reading list (title, author, and whether it's in your course). "Use this
      reading list" puts a module's books into the course (uni-use); modules with no reading list of their own are
      listed under it. A programme can be fetched again, removed, or added from a university's page (uni-fetch).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import HiddenNote from "../../core/page/HiddenNote.svelte";
    import { lcCur } from "../learning";
    import { curriculaLook } from "./look";
    import LcHead from "./LcHead.svelte";

    const v = $derived.by(() => {
        void store.itemsByFrame;
        void store.meta;
        void store.ui;
        const C = lcCur();
        return C ? { id: C.id, name: C.name, P: curriculaLook(C) } : null;
    });
</script>

<HiddenNote />
<LcHead cur={v ? v.id : ""} hub={false} />
{#if !v}<div class="empty"><p>Add a course first.</p><p class="hint">Curricula shows the programmes a course was built from: their modules, the topics each teaches, and their reading lists.</p><button class="btn gold" data-act="lc-new" data-k="">+ New course</button></div>{:else}<div class="curr"><div class="unihead"><h2 class="ltitle">Curricula <span class="hint">for {v.name}</span></h2><span class="spacer"></span><button class="btn sm" data-act="uni-fetch">Fetch a programme…</button></div>
    {#if !v.P.length}<div class="empty"><p>No programmes in {v.name} yet.</p><p class="hint">"Fetch more" on the course adds the programmes that teach a subject or topic; "Fetch a programme" reads one from a university's page.</p></div>{:else}<div class="cuprogs">{#each v.P as p (p.id)}{@const withList = p.modules.filter(m => m.books.length)}{@const rest = p.modules.filter(m => !m.books.length)}<section class="panel cuprog"><div class="cuph"><div><b>{p.uni}</b><span>{p.name}</span></div><button class="linkbtn" data-act="uni-del" data-k={p.id} aria-label="Remove {p.uni} {p.name}">remove</button></div>
            <small class="lcfs {p.state.cls}">{#if p.state.cls === "busy"}<span class="spin"></span>{/if}{p.state.t}{#if p.href} · <a class="link" href={p.href} target="_blank" rel="noopener noreferrer">its page ↗</a>{/if}{#if p.src} · <a class="link" href={p.src} target="_blank" rel="noopener noreferrer">reading lists ↗</a>{/if}{#if p.canFetch && p.state.cls !== "busy"} · <button class="linkbtn" data-act="uni-again" data-k={p.id}>Fetch again</button>{/if}</small>
            {#each withList as m (m.i)}<div class="cumod"><div class="cumh"><b>{m.code ? m.code + " " : ""}{m.name}</b><small>{m.lvl}{m.core === false ? " · option" : ""}</small></div>{#if m.topics.length}<div class="cutops">{#each m.topics as t, ti (ti)}<span class="chip">{t}</span>{/each}</div>{/if}
                <ol class="culist">{#each m.books as b, j (j + b.t)}<li class={b.inCourse ? "in" : ""}><b>{b.t}</b> <small>{b.a}</small>{#if b.inCourse}<i>in your course</i>{/if}</li>{/each}</ol>
                <div class="bar"><button class="btn sm{m.all ? ' ghost' : ''}" data-act="uni-use" data-k={p.id} data-m={m.i} disabled={m.all}>{m.all ? "All in your course" : "Use this reading list"}</button>{#if m.list}<a class="link" href={m.list} target="_blank" rel="noopener noreferrer">the list ↗</a>{/if}</div></div>{/each}
            {#if rest.length}<details class="curest" open={!withList.length}><summary class="hint">{withList.length ? `${rest.length} more modules with no reading list here` : `${rest.length} modules (no reading lists here yet)`}</summary><ul>{#each rest as m (m.i)}<li><b>{m.code ? m.code + " " : ""}{m.name}</b>{#if m.topics.length} <small>{m.topics.join(", ")}</small>{/if}</li>{/each}</ul></details>{/if}</section>{/each}</div>{/if}</div>{/if}
