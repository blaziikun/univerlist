<!--
    src/features/learning-centre/pages/CurTable.svelte
    ─────────────────────────────────────────────────────────────────
      Curricula's merged table: every topic once, by area, with the programmes that teach it (★ compulsory, ● offered)
      and every book they set for it, most set first. Picking one makes it your book for that topic (uni-pick); "+ book"
      adds one of your own and picks it. Then your picks go to your library (uni-tolib) or into the course's reading
      order (uni-topath). curRow() in look.ts works out each row.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { markDirty } from "../../core/core";
    import type { CurProgramme, Curriculum } from "../../core/model";
    import { bookKey, curS } from "../learning-curricula";
    import { curRow } from "./look";

    let {
        sid,
        S,
        shown,
        abbr,
        books,
    }: {
        sid: string;
        S: Curriculum;
        shown: CurProgramme[];
        abbr: (p: CurProgramme) => string;
        books: Record<string, [string, string]>;
    } = $props();

    const areas = $derived(
        [...new Set(S.topics.map(t => t.area || "Topics"))].map(a => ({
            a,
            rows: S.topics.filter(t => (t.area || "Topics") === a).map(t => curRow(S, shown, books, t)),
        }))
    );
    const picked = $derived(S.topics.map(t => S.chosen[t.id]).filter(Boolean).length);

    // a book of your own for a topic, "Title — Author": it's added and becomes your pick
    function add(tid: string, box: HTMLInputElement) {
        const v = box.value.trim();
        if (!v) return;
        const C = curS(sid),
            [bt, ba = ""] = v.split(/\s+[—–-]\s+/),
            k = bookKey(bt, ba);
        C.extra[tid] = [...(C.extra[tid] || []), [k, bt, ba]];
        C.chosen[tid] = k;
        box.value = "";
        markDirty();
    }
</script>

<p class="hint">★ compulsory · ● offered. Each book shows how many programmes set it (×2…); hover for which modules. The most set isn't always the best to learn from alone: click the one that is, and it becomes your book for that topic (best for self-study).</p>
<div class="unitable"><table><thead><tr><th>Topic</th>{#each shown as p, i (i + p.id)}<th title="{p.uni || ''} · {p.name}">{abbr(p)}</th>{/each}<th>Books they set · your pick for self-study</th></tr></thead>
    <tbody>{#each areas as g, gi (gi + g.a)}<tr class="uarea"><td colspan={shown.length + 2}>{g.a}</td></tr>{#each g.rows as r, i (i + r.id)}<tr class={r.taught ? "" : "untaught"}><td class="ut"><b>{r.name}</b><small>{r.taught} of {shown.length}</small></td>{#each r.cells as c, j (j)}<td class="uc{c.on ? ' on' : ''}{c.core ? ' core' : ''}" title={c.title}>{c.on ? (c.core ? "★" : "●") : ""}</td>{/each}
        <td class="ub">{#each r.books as b, j (j + b.k)}<button class="ubk{b.on ? ' on' : ''}{b.most ? ' most' : ''}" data-act="uni-pick" data-k={r.id} data-b={b.k} title={b.title}><b>{b.t}</b> <small>{b.a}</small>{#if b.n > 1}<i>×{b.n}</i>{/if}{#if b.inLib}<i class="own">in library</i>{/if}</button>{/each}
            <input class="inp ubadd" placeholder="+ book (Title — Author)" data-uniadd={r.id} onchange={e => add(r.id, e.currentTarget)}></td></tr>{/each}{/each}</tbody></table></div>
<div class="bar" style="margin-top:12px"><button class="btn sm" data-act="uni-tolib" disabled={!picked}>Add my {picked} chosen books to the library</button><button class="btn sm gold" data-act="uni-topath" disabled={!picked}>Add my picks to the course</button><span class="hint">Picking changes only your choice; what each programme sets stays as it is.</span></div>
