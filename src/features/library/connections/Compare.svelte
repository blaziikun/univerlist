<!--
    src/features/library/connections/Compare.svelte
    ─────────────────────────────────────────────────────────────────
      Stats › Compare: your scores against the crowd's (a scatter, and what you love more or less than most), the
      mode's shelves side by side, its genres across its shelves, and any two things side by side (picked in the two
      boxes, this view's own; ui.cmpA and ui.cmpB remember them). What it shows comes from compareView() in connect.ts.
      A dot opens its entry (open, as every chart's does in core/events.ts); the buttons go through go-genre, cmp-link
      and cmp-rank.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { ui } from "../../core/core";
    import { renderMain } from "../../core/shell";
    import { idFromOption } from "../../core/navigation";
    import { compareView } from "../connect";
    import Legend from "../stats/Legend.svelte";
    import Cover from "../tiles/Cover.svelte";

    const v = $derived.by(() => {
        void store.itemsByFrame;
        void store.meta;
        void store.ui;
        return compareView();
    });
    const s = $derived(v.scatter);
    // the titles the two boxes offer: every entry you can see, so thousands of them, made in one go (as one {#each}
    // they took a third of a second on the stress test's 10,000) and made again when the library changes
    const options = (titles: string[]) => (list: HTMLDataListElement) => {
        list.replaceChildren(
            ...titles.map(t => {
                const o = document.createElement("option");
                o.value = t;
                return o;
            })
        );
    };
    // a title picked from the list in either box
    function pick(which: "cmpA" | "cmpB", value: string) {
        const id = idFromOption(value);
        if (!id) return;
        ui[which] = id;
        renderMain();
    }
</script>

{#snippet row(x: (typeof v.more)[number])}<button class="drow" data-act="open" data-id={x.b.id}><Cover b={x.b} /><span class="t">{x.title}</span><span class="num">{x.you}</span><span class="num">{x.crowd}</span><span class="num {x.d >= 0 ? 'up' : 'down'}">{x.gap}</span></button>{/snippet}
<div class="dash">{" "}
      <section class="panel span8"><h3>You vs the crowd · {v.rated} scored</h3>{#if v.rated}{#if v.legend}<Legend present={v.legend} />{/if}<svg class="chart scatter" viewBox="0 0 {s.W} {s.H}" role="img" aria-label="Your score against the crowd">{" "}
    {#each s.ticks as t (t.t)}<line class="gridl" x1={t.x} x2={t.x} y1="10" y2={s.H - s.P}/><line class="gridl" x1={s.P} x2={s.W - 10} y1={t.y} y2={t.y}/><text x={t.x} y={s.H - s.P + 16} text-anchor="middle">{t.t}</text><text x={s.P - 6} y={t.y + 3} text-anchor="end">{t.t}</text>{/each}{" "}
    <line class="diag" x1={s.diag.x1} y1={s.diag.y1} x2={s.diag.x2} y2={s.diag.y2}/>{" "}
    <text x={s.W / 2} y={s.H - 4} text-anchor="middle">Crowd score</text><text x="12" y={s.H / 2} text-anchor="middle" transform="rotate(-90 12 {s.H / 2})">Your score</text>{" "}
    {#each s.dots as d (d.id)}<g class="dotg" data-act="open" data-id={d.id}><circle class="hit" cx={d.x} cy={d.y} r="10"/><circle cx={d.x} cy={d.y} r="5" fill={d.fill} class="dot"/><title>{d.title}</title></g>{/each}</svg><p class="hint">Above the line you liked it more than most people did. Crowd scores average every site that has one, scaled to 100.</p>{:else}<p class="hint">Score a few things on their cards (or sync AniList) and crowd scores fill in automatically.</p>{/if}</section>
      <section class="panel span4"><h3>You love more than most</h3>{#each v.more as x (x.b.id)}{@render row(x)}{:else}<p class="hint">Nothing yet.</p>{/each}
        <h3 style="margin-top:16px">The crowd loves more than you</h3>{#each v.less as x (x.b.id)}{@render row(x)}{:else}<p class="hint">Nothing yet.</p>{/each}</section>{" "}{#if v.shelves.length}<section class="panel span12"><h3>Across shelves</h3><div class="tablewrap"><table class="lib small"><thead><tr><th>Shelf</th><th>Items</th><th>Finished</th><th>Your mean</th><th>Crowd mean</th><th>Time</th></tr></thead><tbody>
        {#each v.shelves as r, i (i)}<tr><td>{r.name}</td><td class="num">{r.n}</td><td class="num">{r.fin}</td><td class="num">{r.mean}</td><td class="num">{r.crowd}</td><td class="num">{r.time}</td></tr>{/each}</tbody></table></div></section>{" "}{/if}{#if v.heat}<section class="panel span12"><h3>Genres across shelves</h3><p class="hint" style="margin-bottom:8px">How many of each genre you have per shelf, with your mean score. Darker means you rate it higher.</p><div class="tablewrap"><table class="lib small heatt"><thead><tr><th>Genre</th>{#each v.heat.shelves as n, i (i)}<th>{n}</th>{/each}</tr></thead><tbody>
        {#each v.heat.rows as r, i (i)}<tr><td><button class="linkbtn" data-act="go-genre" data-k={r.g}>{r.g}</button></td>{#each r.cells as c, j (j)}<td class="hc" style={c.style} title={c.title}>{#if c.n}<b>{c.n}</b>{#if c.mean}<small>{c.mean}</small>{/if}{/if}</td>{/each}</tr>{/each}</tbody></table></div></section>{" "}{/if}<section class="panel span12"><h3>Side by side</h3><div class="bar"><input class="inp" id="cmp-a" list="cmp-opts" placeholder="Pick anything…" value={v.a} style="max-width:300px" onchange={e => pick("cmpA", e.currentTarget.value)}><span class="hint">vs</span><input class="inp" id="cmp-b" list="cmp-opts" placeholder="…and something else" value={v.b} style="max-width:300px" onchange={e => pick("cmpB", e.currentTarget.value)}><datalist id="cmp-opts" {@attach options(v.opts)}></datalist></div>
        {#if v.sbs}<div class="sbs"><div class="sbh"><button data-act="open" data-id={v.sbs.pair[0].b.id}><Cover b={v.sbs.pair[0].b} /><span class="t">{v.sbs.pair[0].title}</span></button><span class="vs">vs</span><button data-act="open" data-id={v.sbs.pair[1].b.id}><Cover b={v.sbs.pair[1].b} /><span class="t">{v.sbs.pair[1].title}</span></button></div>
    <table class="lib small"><tbody>{#each v.sbs.rows as r (r.l)}<tr><th>{r.l}</th><td>{r.a}</td><td>{r.b}</td></tr>{/each}</tbody></table>
    {#if v.sbs.shared}<p class="hint">Shared genres: {v.sbs.shared}.</p>{/if}<div class="bar"><button class="btn sm" data-act="cmp-link">Link these two</button><button class="btn sm ghost" data-act="cmp-rank">Pick a winner in Rank</button></div></div>{:else}<p class="hint" style="margin-top:8px">Compare any two things, even a book and a game.</p>{/if}</section>{" "}
    </div>
