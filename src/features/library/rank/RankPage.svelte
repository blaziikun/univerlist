<!--
    src/features/library/rank/RankPage.svelte
    ─────────────────────────────────────────────────────────────────
      A mode's Rank tab: two things to pick between (what you've finished or what's planned, from one shelf or every
      one), the ranking your picks have made, and the Seasons panel (SeasonsPanel). What it shows comes from rankView()
      in core/views.ts; the pair and the picks are rankState's there. The shelf menu and the keys (← and → pick, ↓ is
      a draw) are this page's own; the buttons go through rank-pick, rank-skip and rank-mode (insights/handlers.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { ui } from "../../core/core";
    import { rankPick, rankState, rankView } from "../../core/views";
    import { renderMain } from "../../core/shell";
    import HiddenNote from "../../core/page/HiddenNote.svelte";
    import Cover from "../tiles/Cover.svelte";
    import MediumDot from "../tiles/MediumDot.svelte";
    import SeasonsPanel from "./SeasonsPanel.svelte";

    const v = $derived.by(() => {
        void store.itemsByFrame;
        void store.meta;
        void store.ui;
        return rankView();
    });
    function shelf(box: HTMLSelectElement) {
        ui.rankShelf = box.value || null;
        rankState.pair = null;
        renderMain();
    }
    // ← and → pick one, ↓ is a draw: before the app's own keys, as they always came first (not while typing or with a
    // dialog open)
    function keys(e: KeyboardEvent) {
        if (ui.keyCapture || ui.modal || !rankState.pair) return;
        if (/INPUT|TEXTAREA|SELECT/.test(String(document.activeElement && document.activeElement.tagName))) return;
        const pick = e.key === "ArrowLeft" ? 0 : e.key === "ArrowRight" ? 1 : e.key === "ArrowDown" ? "draw" : null;
        if (pick === null) return;
        if (pick === "draw") e.preventDefault();
        e.stopPropagation();
        rankPick(pick);
    }
</script>

<svelte:document onkeydowncapture={keys} />

<HiddenNote /><div class="ph"><div class="ttl"><p>{v.want ? `Pick the one you want to start more. The order becomes the "Most wanted" sort.` : `Pick the one you liked more. After a few dozen picks this is your real ranking, and "My ranking" becomes a sort option.`}</p></div><span class="spacer"></span>
      <div class="seg">{#each [["liked", "Finished"], ["want", "Backlog"]] as [k, l] (k)}<button data-act="rank-mode" data-k={k} aria-pressed={(v.want ? "want" : "liked") === k}>{l}</button>{/each}</div>
      <select class="sel" id="rank-shelf" aria-label="Shelf" onchange={e => shelf(e.currentTarget)}><option value="" selected={!v.shelf}>Every shelf</option>{#each v.shelves as s, i (i)}<option value={s.key} selected={v.shelf === s.key}>{s.name}</option>{/each}</select></div>
    {#if v.pair}<div class="duel">{#each v.pair as c, i (i)}{#if i}<div class="vs">or</div>{/if}{#if c}<button class="contender" data-act="rank-pick" data-k={c.side}><Cover b={c.b} /><div><div class="call">{c.call}</div><div class="t">{c.title}</div><div class="hint">{c.hint}</div><p class="hint" style="margin-top:8px">{c.about}</p></div></button>{/if}{/each}</div>
      <div class="bar" style="justify-content:center;margin:14px 0 26px"><button class="btn" data-act="rank-pick" data-k="draw">Can't decide <span class="kbd">↓</span></button><button class="btn ghost" data-act="rank-skip">Skip</button><span class="hint">Keys: <span class="kbd">←</span> <span class="kbd">→</span></span></div>{:else}<div class="empty"><h3>Not enough to compare yet</h3>{#if v.want}<p>You need at least two planned items here.</p>{:else}<p>This ranks things you've finished, scored or are in the middle of.</p><div class="bar" style="justify-content:center"><button class="btn gold" data-act="rank-mode" data-k="want">Rank my backlog</button></div>{/if}</div>{/if}{" "}{#if v.board.length}<div class="panel"><h3>{v.want ? "Most wanted" : "Your ranking"} · {v.compared} compared</h3><div class="board">{#each v.board as r (r.b.id)}<button data-act="open" data-id={r.b.id}><span class="r">{r.r}</span><Cover b={r.b} /><span class="t"><MediumDot m={r.b.medium} />{r.title}</span><span class="hint">{r.picks}</span></button>{/each}</div></div>{" "}{/if}<SeasonsPanel />
