<!--
    src/features/library/page/LibraryPage.svelte
    ─────────────────────────────────────────────────────────────────
      The library page: a mode's entries as covers, cards, spines or a table, grouped and sorted, with the bar above
      them (LibraryBar), the filter (FilterPanel), and the bar for what you've selected (BulkBar).

      The shell (core/shell.ts) draws the profile header and the tab's frame, and hands the frame to this (core/
      pages.ts, as "profile:library"). What's shown is worked out in library.ts (libraryView) from where you are and
      the mode, read through the store, so a change anywhere shows here without redrawing the rest.
      A library of more than VIRTUAL_FROM entries draws only the rows near the window (rows.ts, shelf.svelte.ts).

      Selecting and dragging happen here too: Shift, Ctrl or ⌘-click a cover (core/nav-handlers.ts "open"), or drag a
      box over covers; drag covers beside another to put them there, onto another to combine, or onto a group's plaque
      to move them to it; while arranging, drag a cover onto another (dnd.ts makes each change).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { mount, onMount, unmount } from "svelte";
    import { clone, closestTo, items, titleOf, ui } from "../../core/core";
    import { store } from "../../core/store.svelte";
    import { isUniversal } from "../../core/views";
    import { combineItems, sameSeries } from "../../core/parts";
    import { renderMain } from "../../core/shell";
    import { FILT_EMPTY, libraryView } from "../library";
    import { groupMove, groupMoveOk, moveTiles, orderDrop } from "./dnd";
    import { VIRTUAL_FROM } from "./rows";
    import { live } from "./live.svelte";
    import BulkBar from "./BulkBar.svelte";
    import EmptyLibrary from "./EmptyLibrary.svelte";
    import FilterPanel from "./FilterPanel.svelte";
    import LibraryBar from "./LibraryBar.svelte";
    import LibraryGroup from "./LibraryGroup.svelte";
    import ListGroup from "./ListGroup.svelte";

    // everything shown, worked out again whenever your library, what you keep or where you are changes. ui's parts
    // are copied: the older code changes them in place
    const page = $derived.by(() => {
        void store.items;
        void store.meta;
        const u = store.ui,
            lib = libraryView();
        return {
            lib,
            q: u.q || "",
            searchAll: !!u.searchAll,
            hidden: !!u.hiddenView,
            status: u.status,
            filterOpen: !!u.filterOpen,
            adv: !!u.filtAdv,
            filt: clone({ ...FILT_EMPTY(), ...(u.filt || {}) }),
            pop: u.pop || null,
            arrange: !!u.arrange,
            selecting: !!u.selecting,
            sel: new Set(u.sel),
            universal: isUniversal(),
        };
    });
    const lib = $derived(page.lib);
    // what a search found, as one line of text (one text node, so it's set exactly as the older page set it)
    const found = $derived.by(() => {
        const n = lib.list.length,
            inMode = !(page.searchAll || page.universal);
        return {
            inMode,
            text: ` ${n} match${n === 1 ? "" : "es"} for “${page.q}”${inMode ? ` in ${lib.mode.name}. ` : " "}`,
        };
    });
    const virtual = $derived(lib.list.length > VIRTUAL_FROM);
    const cls = $derived(
        lib.view === "spine"
            ? "shelf"
            : lib.view === "cover"
              ? `faceout${lib.vo.titles ? " titled" : ""}${lib.vo.true ? " truesize" : ""}`
              : `grid${lib.vo.titles ? "" : " notitles"}`
    );
    const style = $derived(`--z:${live.z ?? lib.vo.z};--gz:${live.gap ?? lib.vo.gap}`);

    // ── the window: where it's scrolled to and how tall it is, for the shelves that draw only what's near it ──
    const vp = $state({ y: 0, h: 0, tick: 0 });
    let frame = 0;
    function moved() {
        if (frame) return;
        frame = requestAnimationFrame(() => {
            frame = 0;
            vp.y = scrollY;
            vp.h = innerHeight;
            vp.tick++;
        });
    }
    let body: HTMLElement | undefined = $state();
    // a group above changing height moves the ones below it
    $effect(() => {
        const el = body;
        if (!el) return;
        const ro = new ResizeObserver(moved);
        ro.observe(el);
        return () => ro.disconnect();
    });
    onMount(() => {
        vp.y = scrollY;
        vp.h = innerHeight;
        // the bar for what you've selected floats over everything, so it lives on the page's body
        const bar = mount(BulkBar, { target: document.body });
        return () => {
            cancelAnimationFrame(frame);
            unmount(bar);
            box?.el?.remove();
            document.body.classList.remove("marqing", "tiledrag");
        };
    });
    $effect(() => {
        void page;
        moved();
    });

    // ── selecting: drag a box over covers ──
    let box: { x: number; y: number; el: HTMLDivElement | null; base: Set<string>; hit: Set<string> } | null = null;
    /** the covers inside the box while you drag it, shown as selected before you let go */
    let boxSel = $state.raw<Set<string> | null>(null);
    const selOf = (id: string) => (boxSel ? boxSel.has(id) : page.sel.has(id));

    function down(e: PointerEvent) {
        if (e.button !== 0 || e.pointerType !== "mouse" || ui.arrange) return;
        // start on any empty part of the library page, or (while selecting) on a cover that isn't selected yet
        if (!closestTo(e, ".tabbody.t-library, main.main") || !body) return;
        const tile = closestTo(e, "[data-oid]");
        if (
            tile
                ? !(ui.selecting && !ui.sel.has(tile.dataset.oid || ""))
                : closestTo(e, "button, a, input, select, label, .libbar, .filtpanel, .prof, .plaque, .note")
        )
            return;
        const add = e.shiftKey || e.metaKey || e.ctrlKey;
        box = { x: e.clientX, y: e.clientY, el: null, base: new Set(add ? ui.sel : []), hit: new Set() };
    }
    function move(e: PointerEvent) {
        if (!box) return;
        if (!box.el) {
            if (Math.hypot(e.clientX - box.x, e.clientY - box.y) < 6) return;
            box.el = document.createElement("div");
            box.el.className = "lbox";
            document.body.append(box.el);
            document.body.classList.add("marqing");
        }
        const r = {
            l: Math.min(e.clientX, box.x),
            t: Math.min(e.clientY, box.y),
            r: Math.max(e.clientX, box.x),
            b: Math.max(e.clientY, box.y),
        };
        Object.assign(box.el.style, {
            left: r.l + "px",
            top: r.t + "px",
            width: r.r - r.l + "px",
            height: r.b - r.t + "px",
        });
        const hit = new Set(box.base);
        for (const el of document.querySelectorAll<HTMLElement>(".libbody [data-oid]")) {
            const q = el.getBoundingClientRect();
            if (q.right > r.l && q.left < r.r && q.bottom > r.t && q.top < r.b && el.dataset.oid) hit.add(el.dataset.oid);
        }
        box.hit = hit;
        boxSel = hit;
        if (e.clientY > innerHeight - 40) scrollBy(0, 14);
        else if (e.clientY < 80) scrollBy(0, -14);
    }
    function up() {
        if (!box) return;
        const m = box;
        box = null;
        if (!m.el) return;
        m.el.remove();
        document.body.classList.remove("marqing");
        boxSel = null;
        ui.sel = m.hit;
        ui.selecting = true;
        ui.confirmBulkDelete = false;
        renderMain();
        // swallow the click that follows the drag
        addEventListener(
            "click",
            ev => {
                ev.stopPropagation();
                ev.preventDefault();
            },
            { capture: true, once: true }
        );
    }

    // ── dragging covers: beside another to put them there, onto another to combine, onto a plaque to move them ──
    let drag: { ids: string[]; over: string | null; since: number; mode: "before" | "after" | "merge" | null } | null =
        null;
    /** while arranging: the cover being dragged, and the one it's over */
    let order: { from: string; over: string | null } | null = $state(null);
    /** the mark on the cover a drag is over, and the plaque that would take it */
    let mark = $state.raw<{ id: string; cls: string } | null>(null);
    let drop = $state<string | null>(null);
    const markOf = (id: string) =>
        (order && order.from === id ? " drag" : "") +
        (order && order.over === id ? " over" : "") +
        (mark && mark.id === id ? " " + mark.cls : "");
    const plaqueAt = (e: Event) => {
        const s = e.target instanceof Element ? e.target.closest(".libbody section.group") : null;
        return s ? s.querySelector<HTMLElement>("[data-gdrop]") : null;
    };

    function dragStart(e: DragEvent) {
        const tile = closestTo(e, ".libbody [data-oid]");
        if (!tile) return;
        const id = tile.dataset.oid || "",
            dt = e.dataTransfer;
        if (ui.arrange) {
            order = { from: id, over: null };
            if (dt) {
                dt.effectAllowed = "move";
                try {
                    dt.setData("text/plain", id);
                } catch (_) {}
            }
            return;
        }
        if (box) {
            e.preventDefault();
            return;
        }
        const ids = ui.sel.has(id) ? [...ui.sel] : [id];
        drag = { ids, over: null, since: 0, mode: null };
        if (dt) {
            dt.effectAllowed = "move";
            try {
                dt.setData("text/plain", ids.join(","));
            } catch (_) {}
        }
        if (ids.length > 1) {
            const g = document.createElement("div");
            g.className = "dragcount";
            g.textContent = ids.length + " selected";
            document.body.append(g);
            dt?.setDragImage(g, 20, 20);
            setTimeout(() => g.remove(), 0);
        }
        document.body.classList.add("tiledrag");
    }
    function dragOver(e: DragEvent) {
        if (order) {
            const q = closestTo(e, ".libbody [data-oid]");
            if (!q) return;
            e.preventDefault();
            order = { ...order, over: q.dataset.oid || null };
            return;
        }
        if (!drag) return;
        mark = null;
        drop = null;
        const tile = closestTo(e, ".libbody [data-oid]"),
            oid = tile?.dataset.oid || "";
        if (tile && oid && !drag.ids.includes(oid)) {
            const q = tile.getBoundingClientRect(),
                cx = (e.clientX - q.left) / q.width;
            e.preventDefault();
            // near its edges a line shows where they'll go; held over the middle for a moment, they combine instead
            if (cx > 0.3 && cx < 0.7) {
                if (drag.over !== oid) {
                    drag.over = oid;
                    drag.since = Date.now();
                }
            } else drag.over = null;
            const merge = drag.over === oid && Date.now() - drag.since > 650;
            drag.mode = merge ? "merge" : cx < 0.5 ? "before" : "after";
            mark = { id: oid, cls: merge ? "combineok" : cx < 0.5 ? "ins-before" : "ins-after" };
            return;
        }
        drag.mode = null;
        const g = plaqueAt(e);
        if (g && groupMoveOk(g.dataset.gdrop || "", drag.ids)) {
            e.preventDefault();
            drop = g.dataset.gdrop || null;
        }
    }
    function dropped(e: DragEvent) {
        if (order) {
            const from = order.from,
                q = closestTo(e, ".libbody [data-oid]");
            order = null;
            if (!q) return;
            e.preventDefault();
            orderDrop(lib.groups, from, q.dataset.oid || "");
            return;
        }
        if (!drag) return;
        const D = drag;
        drag = null;
        mark = null;
        drop = null;
        document.body.classList.remove("tiledrag");
        const tile = closestTo(e, ".libbody [data-oid]"),
            to = tile?.dataset.oid || "";
        if (tile && to && !D.ids.includes(to)) {
            e.preventDefault();
            if (D.mode === "merge") {
                const A = items.get(to),
                    B = items.get(D.ids[0]);
                if (
                    A &&
                    B &&
                    (sameSeries(A, B) ||
                        D.ids.length > 1 ||
                        confirm(`Combine “${titleOf(B)}” into “${titleOf(A)}”? They don't look like the same series.`))
                ) {
                    combineItems([to, ...D.ids], to);
                    renderMain();
                }
                return;
            }
            moveTiles(lib.groups, D.ids, to, D.mode === "after");
            return;
        }
        const g = plaqueAt(e);
        if (g) {
            e.preventDefault();
            groupMove(g.dataset.gdrop || "", D.ids);
        }
    }
    function dragEnd() {
        drag = null;
        order = null;
        mark = null;
        drop = null;
        document.body.classList.remove("tiledrag");
    }
</script>

<svelte:window onscroll={moved} onresize={moved} />
<svelte:document onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} ondragstart={dragStart} ondragover={dragOver} ondrop={dropped} ondragend={dragEnd} />

{#if page.hidden}<div class="note"><span class="b-ic">◌</span> Hidden: these are left out of every list, stat and overview. <button class="linkbtn" data-act="hidden-view">Back to everything</button></div>{/if}{#if page.q}<div class="note"><span class="b-ic">⌕</span>{found.text}{#if found.inMode}<button class="linkbtn" data-act="search-all">Search everything</button>{" "}{/if}<button class="linkbtn" data-act="search-clear">Clear</button></div>{/if}{#if lib.shelves.length}<div class="chips shelfchips" role="group" aria-label="Shelves"><button class="chip" data-act="shelf" data-k="" aria-pressed={!store.ui.shelfKey}>All <span class="cn">{lib.all.length}</span></button>{#each lib.shelves as { s, n }}<button class="chip" data-act="shelf" data-k={s.key} aria-pressed={store.ui.shelfKey === s.key}>{s.name} <span class="cn">{n}</span></button>{/each}</div>{/if}
    <LibraryBar {lib} status={page.status} filterOpen={page.filterOpen} pop={page.pop} arrange={page.arrange} selecting={page.selecting} />
    {#if page.filterOpen}<FilterPanel base={lib.base} f={page.filt} status={page.status} adv={page.adv} universal={page.universal} />{/if}{#if page.arrange}<div class="note">Drag into place. <b>Shelf</b> saves how the shelf looks; <b>Ranking</b> keeps scores first and saves your order among equal scores. Kept for {lib.mode.name}.</div>{/if}{#if !lib.list.length}<EmptyLibrary total={lib.all.length} base={lib.base.length} />{:else if lib.view === "list"}<div class="libbody v-list" bind:this={body}>{#each lib.groups as gr (gr.k)}<ListGroup {gr} {lib} {virtual} {vp} {selOf} {drop} />{/each}</div>{:else}<div class="libbody v-{lib.view}{page.arrange ? ' arranging' : ''}" {style} bind:this={body}>{#each lib.groups as gr (gr.k)}<LibraryGroup {gr} {lib} {cls} {virtual} {vp} arrange={page.arrange} {selOf} {markOf} {drop} />{/each}</div>{/if}
