<!--
    src/features/library/tiers/TierListPage.svelte
    ─────────────────────────────────────────────────────────────────
      A tier list or ranked list, open in the Lists tab: its name, layout, size, quick rank, the picture and more
      (scores, the unplaced beside the board, moving everything back, deleting it); what's selected and where to send
      it; the board (TierBoard); the unplaced, filtered, with where they come from (your library, or a title whose
      characters or cast you pull in); and quick rank. Which list is ui.listId; what's selected is tierSel (tiers.ts),
      so the right-click menu and the buttons share it.
      The buttons go through tl-… and tq-… (tiers.ts). The boxes, pulling in (it takes what's typed here), dragging
      entries to a tier or into place (one, or everything selected), the box you drag around several to select them, and
      the keys (1–9, 0, Delete, Esc, Ctrl/⌘A, Q, /) are this page's own.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { changeMeta, clone, curMode, meta, ticked, titleOf, ui } from "../../core/core";
    import { all } from "../../core/views";
    import { renderMain } from "../../core/shell";
    import HiddenNote from "../../core/page/HiddenNote.svelte";
    import {
        chipLook,
        isTier,
        POOL_MAX,
        quickPlace,
        quickSkip,
        setTier,
        tierAvg,
        tierClick,
        TIER_WHAT,
        tierPlace,
        tierPool,
        tierPull,
        tierSel,
        tierWhat,
        type ChipLook,
        type TierList,
    } from "../tiers";
    import TierBoard from "./TierBoard.svelte";
    import TierChip from "./TierChip.svelte";
    import QuickRank from "./QuickRank.svelte";

    const v = $derived.by(() => {
        void store.itemsByFrame;
        void store.meta;
        const u = store.ui,
            live = meta.lists.find(x => x.id === u.listId);
        if (!isTier(live)) return null;
        const L: TierList = clone(live),
            pool = tierPool(live),
            w = tierWhat(L),
            chips: Record<string, ChipLook | null> = {};
        for (const k of [...L.rows.flatMap(r => r.ids), ...pool.slice(0, POOL_MAX)]) chips[k] = chipLook(L, k);
        const quick = u.tquick && pool[0] ? chipLook(L, pool[0]) : null;
        if (u.tquick && !quick) ui.tquick = null; // nothing left to place: quick rank ends, as it always did
        return {
            L,
            w,
            rank: L.layout === "rank",
            pool,
            chips,
            avgs: L.rows.map(r => (w === "items" ? tierAvg(r) : "")),
            sel: new Set(tierSel),
            quick,
            more: !!u.tlMore,
            del: !!u.confirmListDel,
            q: u.tierQ || "",
            pulling: !!u.tlPulling,
            modes: [["", "From " + curMode().name], ...meta.modes.map((m): [string, string] => [m.id, "From " + m.name])],
            titles: w === "items" ? [] : [...new Set(all().map(b => titleOf(b)))].slice(0, 3000),
        };
    });

    // ── its boxes ──
    function rename(value: string) {
        const id = v?.L.id;
        changeMeta("Rename", "lists", A => A.map(l => (l.id === id ? { ...l, name: value.trim() || l.name } : l)));
    }
    const lid = () => v?.L.id || "";
    function rowLabel(i: number, value: string) {
        const t = value.trim();
        setTier(lid(), X => ((X.rows[i].label = t || X.rows[i].label), X), "Rename tier");
    }
    const rowColour = (i: number, value: string) => setTier(lid(), X => ((X.rows[i].color = value), X), "Tier colour");
    const flag = (f: "onlyDone" | "scores" | "poolSide", box: HTMLInputElement) => setTier(lid(), X => ((X[f] = ticked(box)), X));
    const fromMode = (value: string) => setTier(lid(), X => ((X.mode = value), X));
    function filter(value: string) {
        ui.tierQ = value;
        renderMain();
    }
    let pullq = $state("");
    function pull() {
        const L = meta.lists.find(x => x.id === ui.listId);
        if (isTier(L)) tierPull(L, pullq);
    }

    // ── dragging: one entry, or every selected entry if you drag a selected one ──
    let drag = $state<{ keys: string[]; from: string } | null>(null),
        overZone = $state(""),
        overRow = $state("");
    const zoneOf = (z: HTMLElement) => `${z.dataset.tz}|${z.classList.contains("tpool") ? 1 : 0}`;
    function dragstart(e: DragEvent) {
        const c = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-tkey]") : null;
        if (!c) return;
        e.stopPropagation();
        const k = c.dataset.tkey || "";
        drag = { keys: tierSel.has(k) ? [...tierSel] : [k], from: k };
        try {
            e.dataTransfer?.setData("text/plain", k);
            if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
        } catch (_) {}
    }
    function dragover(e: DragEvent) {
        if (!drag || !(e.target instanceof Element)) return;
        const z = e.target.closest<HTMLElement>("[data-tz]");
        if (!z) return;
        e.preventDefault();
        overZone = zoneOf(z);
        overRow = e.target.closest<HTMLElement>(".rkrow")?.dataset.tkey || "";
    }
    function drop(e: DragEvent) {
        if (!drag) return;
        const keys = drag.keys,
            z = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-tz]") : null;
        drag = null;
        overZone = overRow = "";
        if (!z || !ui.listId || !(e.target instanceof Element)) return;
        e.preventDefault();
        e.stopPropagation();
        const before = e.target.closest<HTMLElement>("[data-tkey]"),
            bk = before && !keys.includes(before.dataset.tkey || "") && before.closest("[data-tz]") === z ? before.dataset.tkey : null;
        tierPlace(ui.listId, keys, z.dataset.tz === "pool" ? "pool" : Number(z.dataset.tz), bk);
    }
    function dragend() {
        if (!drag) return;
        drag = null;
        overZone = overRow = "";
    }

    // ── drag a box around several to select them ──
    let marq: { x: number; y: number; add: boolean; el: HTMLElement | null; moved: boolean } | null = null,
        boxed = $state(new Set<string>());
    function pointerdown(e: PointerEvent) {
        if (e.button !== 0 || e.pointerType === "touch" || !(e.target instanceof Element)) return;
        const z = e.target.closest(".tzone, .rankboard, .tpool");
        if (!z || e.target.closest("[data-tkey], button, input, select, label, a")) return;
        marq = { x: e.clientX, y: e.clientY, add: e.shiftKey || e.metaKey || e.ctrlKey, el: null, moved: false };
    }
    function pointermove(e: PointerEvent) {
        if (!marq) return;
        const dx = e.clientX - marq.x,
            dy = e.clientY - marq.y;
        if (!marq.moved && Math.hypot(dx, dy) < 6) return;
        if (!marq.moved) {
            marq.moved = true;
            const el = document.createElement("div"); // the box follows the pointer above everything (on <body>)
            el.className = "marq";
            document.body.append(el);
            marq.el = el;
            if (!marq.add) {
                tierSel.clear();
                renderMain();
            }
        }
        const r = { l: Math.min(e.clientX, marq.x), t: Math.min(e.clientY, marq.y), r: Math.max(e.clientX, marq.x), b: Math.max(e.clientY, marq.y) };
        if (marq.el)
            Object.assign(marq.el.style, { left: r.l + "px", top: r.t + "px", width: r.r - r.l + "px", height: r.b - r.t + "px" });
        const hit = new Set<string>();
        for (const c of document.querySelectorAll<HTMLElement>("[data-tkey]")) {
            const b = c.getBoundingClientRect();
            if (b.left < r.r && b.right > r.l && b.top < r.b && b.bottom > r.t) hit.add(c.dataset.tkey || "");
        }
        boxed = hit;
    }
    function pointerup() {
        if (!marq) return;
        const m = marq;
        marq = null;
        if (!m.moved) return;
        for (const k of boxed) tierSel.add(k);
        boxed = new Set();
        m.el?.remove();
        renderMain();
        // the click that ends the drag doesn't select or place anything
        const stop = (ev: Event) => {
            ev.stopPropagation();
            ev.preventDefault();
        };
        document.addEventListener("click", stop, { capture: true, once: true });
        setTimeout(() => document.removeEventListener("click", stop, true), 50);
    }
    const mark = (k: string) =>
        `${v?.sel.has(k) ? " on" : ""}${drag?.from === k ? " drag" : ""}${boxed.has(k) ? " mq" : ""}${overRow === k ? " over" : ""}`;
    const over = (zone: string) => (overZone === (zone.includes("|") ? zone : zone + "|0") ? " over" : "");

    // ── keys ──
    function keydown(e: KeyboardEvent) {
        if (ui.modal || !v) return;
        const L = meta.lists.find(x => x.id === ui.listId);
        if (!isTier(L)) return;
        const el = e.target instanceof Element ? e.target : null;
        if (el?.closest("input, textarea, select")) return;
        const stop = () => {
            e.preventDefault();
            e.stopImmediatePropagation();
        };
        if (ui.tquick) {
            if (/^[1-9]$/.test(e.key)) {
                stop();
                const i = Number(e.key) - 1;
                if (L.layout === "rank" || L.rows[i]) quickPlace(L, L.layout === "rank" ? 0 : i);
            } else if (e.key === "ArrowRight" || e.key.toLowerCase() === "s") {
                stop();
                quickSkip(L);
            } else if (e.key === "Escape") {
                stop();
                ui.tquick = null;
                renderMain();
            }
            return;
        }
        if (/^[1-9]$/.test(e.key) && tierSel.size && !e.metaKey && !e.ctrlKey) {
            stop();
            const i = Number(e.key) - 1;
            if (L.layout === "rank") tierPlace(L.id, [...tierSel], 0);
            else if (L.rows[i]) tierPlace(L.id, [...tierSel], i);
        } else if ((e.key === "0" || e.key === "Delete" || e.key === "Backspace") && tierSel.size) {
            stop();
            tierPlace(L.id, [...tierSel], "pool");
        } else if (e.key === "Escape" && tierSel.size) {
            stop();
            tierSel.clear();
            renderMain();
        } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
            stop();
            for (const x of tierPool(L).slice(0, POOL_MAX)) tierSel.add(x);
            renderMain();
        } else if (e.key.toLowerCase() === "q" && !e.metaKey && !e.ctrlKey) {
            stop();
            tierClick("tl-quick", null, "", e);
        } else if (e.key === "/") {
            stop();
            document.getElementById("tier-q")?.focus();
        }
    }
</script>

<svelte:document ondragstartcapture={dragstart} ondragovercapture={dragover} ondropcapture={drop} ondragendcapture={dragend} onpointerdowncapture={pointerdown} onpointermovecapture={pointermove} onpointerupcapture={pointerup} onkeydowncapture={keydown} />
<HiddenNote />
{#if v}{@const L = v.L}
    <div class="ph"><div class="ttl"><div class="eyebrow"><button class="linkbtn" data-act="go-list" data-k="">Lists</button> / {TIER_WHAT[v.w]}</div><!-- svelte-ignore a11y_missing_content: the heading is the box the list's name is typed in, labelled by its aria-label --><h2><input class="h2in" id="tl-name" value={L.name} aria-label="Name" onchange={e => rename(e.currentTarget.value)}></h2></div><span class="spacer"></span>
        <div class="seg" role="group" aria-label="Layout"><button data-act="tl-layout" data-k="tiers" aria-pressed={!v.rank}>Tiers</button><button data-act="tl-layout" data-k="rank" aria-pressed={v.rank}>Ranked</button></div>
        <div class="seg" role="group" aria-label="Size">{#each [["s", "S"], ["m", "M"], ["l", "L"]] as [k, l] (k)}<button data-act="tl-size" data-k={k} aria-pressed={(L.size || "m") === k}>{l}</button>{/each}</div>
        <button class="btn ghost" data-act="tl-quick" title="Go through the unplaced one by one (Q)">⚡ Quick rank</button><button class="btn ghost" data-act="tl-png" title="Save as a picture">⤓ Image</button>
        <button class="btn ghost" data-act="tl-more" aria-label="More">⋯</button></div>
    {#if v.more}<div class="panel tlmore"><div class="bar"><label class="ctl"><input type="checkbox" id="tl-scores" checked={L.scores !== false} onchange={e => flag("scores", e.currentTarget)}> Show scores</label><label class="ctl"><input type="checkbox" id="tl-side" checked={!!L.poolSide} onchange={e => flag("poolSide", e.currentTarget)}> Unplaced beside the board</label><button class="btn sm ghost" data-act="tl-clear">Move everything back</button>{#if v.del}<button class="btn sm danger" data-act="list-del-yes">Delete</button><button class="btn sm ghost" data-act="list-del-no">Keep</button>{:else}<button class="btn sm danger" data-act="list-del">Delete</button>{/if}</div>
        <p class="hint">Keys: click or Shift-click to select, drag a box around several · 1–9 send them to that tier · 0 or Delete back to unplaced · Ctrl/⌘A selects all unplaced · Q quick rank · / filter · Esc clear.</p></div>{/if}
    {#if v.sel.size}<div class="tselbar"><b>{v.sel.size} selected</b>{#if v.rank}<button class="btn sm" data-act="tl-place" data-k="0">Add to the ranking</button>{:else}{#each L.rows as r, i (i)}<button class="btn sm" data-act="tl-place" data-k={i} style="border-left-color:{r.color}"><kbd>{i + 1}</kbd> {r.label}</button>{/each}{/if}<button class="btn sm ghost" data-act="tl-place" data-k="pool"><kbd>0</kbd> Unplace</button><button class="linkbtn" data-act="tl-none">Clear</button></div>{/if}
    <div class="tlwrap size-{L.size || 'm'}{L.poolSide ? ' side' : ''}"><TierBoard rows={L.rows} rank={v.rank} chips={v.chips} avgs={v.avgs} {mark} {over} rename={rowLabel} recolour={rowColour} />
        <div class="panel tpool{over('pool|1')}" data-tz="pool" data-act="tl-place" data-k="pool"><h3>Unplaced · {v.pool.length} <span class="r"><input class="inp" id="tier-q" placeholder="Filter  /" value={v.q} onchange={e => filter(e.currentTarget.value)}></span></h3>
            <div class="bar tpbar">{#if v.w === "items"}<label class="ctl"><input type="checkbox" id="tl-onlydone" checked={!!L.onlyDone} onchange={e => flag("onlyDone", e.currentTarget)}> Only finished or scored</label><select class="sel" id="tl-mode" aria-label="Where they come from" value={L.mode || ""} onchange={e => fromMode(e.currentTarget.value)}>{#each v.modes as [k, l] (k)}<option value={k}>{l}</option>{/each}</select>{:else}<input class="inp" id="tl-pullq" list="tl-titles" placeholder="Pull in the {v.w === 'chars' ? 'characters' : 'cast'} of…" style="flex:1;min-width:200px" bind:value={pullq} onkeydown={e => { if (e.key === "Enter") { e.preventDefault(); pull(); } }}><datalist id="tl-titles">{#each v.titles as t, i (i)}<option value={t}></option>{/each}</datalist><button class="btn sm" data-act="tl-pull" onclick={pull}>{v.pulling ? "Pulling…" : "Pull in"}</button>{/if}
                <button class="linkbtn" data-act="tl-selall">Select all{v.pool.length > POOL_MAX ? " " + POOL_MAX : ""}</button></div>
            <div class="tzone pool{over('pool')}" data-tz="pool">{#each v.pool.slice(0, POOL_MAX).filter(k => v.chips[k]) as k, i (i + ":" + k)}{@const c = v.chips[k]}{#if c}<TierChip {c} mark={mark(k)} />{/if}{:else}<p class="hint">{v.w === "items" ? "Everything's placed." : `Nothing here yet. Pull in the ${v.w === "chars" ? "characters" : "cast"} of a title above${v.w === "chars" && !meta.chars.length ? ", or favourite some characters" : ""}.`}</p>{/each}{#if v.pool.length > POOL_MAX}<p class="hint">…and {v.pool.length - POOL_MAX} more. Filter to find them.</p>{/if}</div></div></div>
    {#if v.quick}<QuickRank c={v.quick} left={v.pool.length} rank={v.rank} rows={L.rows} />{/if}{/if}
