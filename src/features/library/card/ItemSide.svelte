<!--
    src/features/library/card/ItemSide.svelte
    ─────────────────────────────────────────────────────────────────
      The item card's side: the cover, status, your score (and in detail), Watch or Read, favourite, Up next and lists,
      what you own of it, the facts, and More (edit, parts, where it lives, refresh, hide, private, delete)

      Its boxes and folds are handled here, and so is your score (ScoreWidget); its buttons that change the library keep their data-act names and are
      handled where the same buttons elsewhere are (library/item-handlers.ts, list-handlers.ts…).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Icon from "../../core/Icon.svelte";
    import { store } from "../../core/store.svelte";
    import { COPY, fmtScore, isStatus, items, MEDIA, meta, patch, scaleOf, SCALES, STATUS, STATUS_WORDS, vault, verbOf } from "../../core/core";
    import { critPatch } from "../../core/actions";
    import { partsOf } from "../../core/parts";
    import { renderMain } from "../../core/shell";
    import { moveToMode } from "../../core/types";
    import { stageOn } from "../../extensions/builtins";
    import { readable } from "../../watch-read/read";
    import { boxAttr, GAME_CASE } from "../tiles/tiles";
    import Cover from "../tiles/Cover.svelte";
    import { criteriaFor, itemFacts, ownWord } from "../item";
    import ScoreWidget from "../score/ScoreWidget.svelte";
    import { setStatus } from "../item-actions";
    import type { Entry, Modal } from "../../core/model";

    let { b, m, onTab }: { b: Entry; m: Modal; onTab: (k: string) => void } = $props();

    const words = $derived(STATUS_WORDS[MEDIA[b.medium].group]);
    const box = $derived(boxAttr(b));
    const plats = $derived([...new Set([...(b.platforms || []), b.platform].filter(Boolean))]);
    const usual = $derived((SCALES.find(x => x[0] === (store.meta.settings.ratingScale || "10d")) || SCALES[0])[1].split(",")[0]);
    const crit = $derived.by(() => {
        const C = criteriaFor(b),
            v = b.crit || {},
            scored = C.filter(k => v[k]);
        return { C, v, scored, avg: scored.length ? scored.reduce((a, k) => a + (v[k] || 0), 0) / scored.length : 0 };
    });
    const queued = $derived(store.meta.queue.includes(b.id));
    const priv = $derived(vault.ids.has(b.id));

    const edit = () => store.dialog({ editing: true }); // Edit details takes focus as it opens
    // a thing scored in detail (n out of 10; 0 clears it), and your score with it when it's their average
    function critScore(c: string, n: number) {
        const x = items.get(b.id);
        if (!x) return;
        const C = { ...(x.crit || {}), [c]: n || undefined };
        if (!C[c]) delete C[c];
        patch(b.id, critPatch(x, C), "Score " + c);
    }
    function critAvg(on: boolean) {
        const x = items.get(b.id);
        if (x) patch(b.id, { critAvg: on || undefined, ...(on ? critPatch({ ...x, critAvg: true }, x.crit || {}) : {}) }, "Score from the detail");
    }
    function platform(v: string) {
        patch(b.id, { platform: v.trim() }, "Platform");
        if (store.ui.page === "profile") renderMain(); // game cases on the shelf follow the platform
    }
    // where it lives and which title it shows change the page behind too
    function home(v: string) {
        moveToMode([b.id], v);
        store.dialog({ moreOpen: true });
        renderMain();
    }
    function titleLang(v: string) {
        patch(b.id, { titleLang: v || undefined }, "Title language");
        store.dialog({ moreOpen: true });
        renderMain();
    }
</script>

{#snippet sel(id: string, opts: [string, string][], val: unknown, change: (v: string) => void)}
    <select class="sel" {id} onchange={e => change(e.currentTarget.value)}>{#each opts as [k, l]}<option value={k} selected={String(val) === String(k)}>{l}</option>{/each}</select>
{/snippet}

<aside class="iside">
    <button class="icover{box.cls}" data-act="item-tab" data-k="art" title="Artwork" style={box.st} onclick={() => onTab("art")}><Cover {b} /></button>
    <div class="ibox"><label class="ilab" for="it-status">Status</label>{@render sel("it-status", STATUS.map((k): [string, string] => [k, words[k]]), b.status, v => isStatus(v) && setStatus(b.id, v))}
        {#if b.status === "done"}<button class="btn sm ghost wide" data-act="reread">{verbOf(b.medium)[1]}</button>{:else if !["active", "redo"].includes(b.status)}<button class="btn sm gold wide" data-act="start" data-id={b.id}>{verbOf(b.medium)[0]}</button>{/if}</div>
    <div class="ibox"><span class="ilab">Your score {#if b.rating}<b class="bigscore">{fmtScore(b.rating, scaleOf(b))}</b>{/if}</span><ScoreWidget {b} pick={n => patch(b.id, { rating: n, critAvg: undefined }, n ? "Score" : "Clear score")} typed={n => patch(b.id, { rating: n }, "Score")} /><label class="ctl iscale">Scale for this one {@render sel("it-scale", [["", "Your usual (" + usual + ")"], ...SCALES], b.scale || "", v => patch(b.id, { scale: v || undefined }, "Score scale"))}</label>{#if crit.scored.length}<div class="critsum">{#each crit.scored as k}<span><small>{k}</small><i style="--w:{(crit.v[k] || 0) * 10}%"></i><b>{fmtScore(crit.v[k])}</b></span>{/each}</div>{/if}<button class="linkbtn" data-act="crit-open" onclick={() => store.dialog({ critOpen: !m.critOpen })}>{m.critOpen ? "Hide the detail" : "Rate in detail"}</button>{#if m.critOpen}<div class="crit">{#each crit.C as k}<div class="critrow"><span class="cl">{k}</span><ScoreWidget {b} act="crit" crit={k} value={crit.v[k] || 0} pick={n => critScore(k, n)} typed={n => critScore(k, n)} /></div>{/each}
            <div class="bar"><label class="ctl"><input type="checkbox" id="crit-avg" checked={!!b.critAvg} onchange={e => critAvg(e.currentTarget.checked)} /> My score is the average of these{crit.avg ? ` (${fmtScore(Math.round(crit.avg * 10) / 10)})` : ""}</label><button class="linkbtn" data-act="go-settings" data-k="ratings">Change the criteria</button></div></div>{/if}</div>
    {#if stageOn() && ["anime", "tv", "film"].includes(b.medium)}<button class="btn gold wide playbtn" data-act="watch-open" data-id={b.id}><Icon name="play" /> Watch</button>{:else if stageOn() && readable(b)}<button class="btn gold wide playbtn" data-act="read-open" data-id={b.id}>❡ Read</button>{/if}
    <div class="ibox irow"><button class="btn sm{b.fav ? ' favon' : ''}" data-act="fav-toggle" data-id={b.id} aria-pressed={!!b.fav}>{b.fav ? "♥ Favourite" : "♡ Favourite"}</button>
        {#if queued}<button class="btn sm" data-act="q-remove" data-id={b.id}>✓ Up next</button>{:else}<button class="btn sm" data-act="q-add" data-id={b.id}>+ Up next</button>{/if}<button class="btn sm" data-act="list-pick" data-id={b.id}>≡ Lists</button></div>
    <div class="ibox"><label class="ilab" for="it-copy">Ownership</label>{@render sel("it-copy", COPY.map(([k]): [string, string] => [k, ownWord(b, k)]), b.copy || "none", v => patch(b.id, { copy: v, toBuy: v === "none" ? items.get(b.id)?.toBuy : false }, "Ownership"))}
        {#if b.copy === "none"}<label class="ctl"><input type="checkbox" id="it-buy" checked={!!b.toBuy} onchange={e => patch(b.id, { toBuy: e.currentTarget.checked }, "Plan to buy")} /> Plan to buy</label>{/if}
        {#if ["manga", "manhwa", "novel"].includes(b.medium) && b.vols && ["physical", "both"].includes(b.copy)}<p class="ilab" style="margin-top:6px">Volumes you own <button class="linkbtn" data-act="vols-all">all</button> · <button class="linkbtn" data-act="vols-none">none</button></p><div class="volgrid">{#each Array.from({ length: Math.min(120, b.vols) }, (_, i) => i + 1) as v}<button data-act="vol-tog" data-k={v} aria-pressed={(b.volsOwned || []).includes(v)}>{v}</button>{/each}</div>{/if}
        {#if b.medium === "game"}<label class="ilab" for="it-plat" style="margin-top:6px">Platform you play on</label><input class="inp" id="it-plat" list="it-plats" value={b.platform || ""} placeholder={plats[0] || "e.g. Switch"} onchange={e => platform(e.currentTarget.value)} /><datalist id="it-plats">{#each plats.concat(GAME_CASE.map(g => g[3])).filter((x, i, a) => a.indexOf(x) === i) as p}<option value={p}></option>{/each}</datalist>{/if}</div>
    <dl class="facts">{#each itemFacts(b) as [l, v]}<div><dt>{l}</dt><dd>{v}</dd></div>{/each}</dl>
    <details class="imore" open={!!m.moreOpen} ontoggle={e => store.dialog({ moreOpen: e.currentTarget.open })}><summary>More</summary>
        <div class="col"><button class="btn sm ghost" data-act="edit" onclick={edit}>Edit details</button><button class="btn sm ghost" data-act="parts-open" onclick={() => store.dialog({ partsOpen: !m.partsOpen, tab: "synopsis" })}>{partsOf(b).length ? "Parts" : "Combine with seasons or sequels"}</button>
            <label class="ctl imode">Lives in {@render sel("it-mode", [["auto", "where its type puts it"], ...store.meta.modes.filter(x => x.id !== "universal").map((x): [string, string] => [x.id, x.name])], b.modeHome || "auto", home)}</label>
            <label class="ctl imode">Title in {@render sel("it-tlang", [["", "app setting"], ["en", "English"], ["romaji", "Romaji"], ["native", "Native"], ["original", "Original"]], b.titleLang || "", titleLang)}</label><button class="btn sm ghost" data-act="item-refresh" disabled={!!m.refreshing}>{m.refreshing ? "Refreshing…" : "Refresh details & scores"}</button>
            <button class="btn sm ghost" data-act="item-hide">{b.hidden ? "Show in lists again" : "Hide from lists"}</button>
            {#if meta.vault}{#if priv}<button class="btn sm ghost" data-act="item-public">Move to main library</button>{:else}<button class="btn sm ghost" data-act="item-private" title={vault.key ? undefined : "Unlock your private collection first"}>🔒 Move to private</button>{/if}{/if}
            {#if m.confirmDelete}<span class="err">Delete this?</span><button class="btn sm danger" data-act="delete-yes">Delete</button><button class="btn sm ghost" data-act="delete-no" onclick={() => store.dialog({ confirmDelete: false })}>Keep</button>{:else}<button class="btn sm danger" data-act="delete" onclick={() => store.dialog({ confirmDelete: true })}>Delete</button>{/if}</div>
        {#if m.refreshNote}<p class="hint">{m.refreshNote}</p>{/if}</details>
</aside>
