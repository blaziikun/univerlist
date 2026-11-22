<!--
    src/features/library/card/ItemProgress.svelte
    ─────────────────────────────────────────────────────────────────
      The item card's progress, under its synopsis: where you are (or "Watched?" for a film), a show's episodes and
      seasons, how far you mean to take a game, the dates, every earlier time through, and the sessions you logged
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { dayKey, fmtDate, fmtHours, fmtScore, items, MEDIA, minutesPerUnit, patch, quietPatch, scaleOf, STATUS, STATUS_WORDS, textOf, unitOf } from "../../core/core";
    import { pct } from "../../core/views";
    import { seasonsOn } from "../../core/modals";
    import { paceText } from "../item";
    import { logProgress } from "../item-actions";
    import type { Entry, Episode, Item, Modal } from "../../core/model";

    let { b, m }: { b: Entry; m: Modal } = $props();

    const M = $derived(MEDIA[b.medium]);
    const unit = $derived(unitOf(b));
    const words = $derived(STATUS_WORDS[M.group]);
    const reads = $derived((b.reads || []).filter(r => r.finishedAt || r.startedAt));
    const log = $derived((b.log || []).slice().reverse());
    const left = $derived(Math.max(0, (b.total || 0) - (b.prog || 0)));
    const seen = $derived(new Set(b.epsSeen || []));
    // a show's episodes from TVmaze, season by season, and the season shown: the first with one left to watch
    const eps = $derived.by(() => {
        if (!m.eps) return null;
        const by: Record<number, Episode[]> = {};
        for (const e of m.eps) (by[e.s] = by[e.s] || []).push(e);
        const S = Object.keys(by)
            .map(Number)
            .sort((a, c) => a - c);
        return { by, S, cur: m.season || S.find(s => by[s].some(e => !seen.has(s + "x" + e.e))) || S[0] };
    });
    const seasons = $derived.by(() => {
        const S = b.seasons || [],
            rated = S.filter(x => x.rating);
        return { S, avg: rated.length ? Math.round((rated.reduce((a, x) => a + Number(x.rating), 0) / rated.length) * 10) / 10 : null };
    });

    let nowBox: HTMLInputElement | undefined = $state();
    let totalBox: HTMLInputElement | undefined = $state();
    let volBox: HTMLInputElement | undefined = $state();
    /** Log: the page or episode you're on (and the total, and the volume, if you changed them) */
    function logNow() {
        const total = parseFloat(totalBox?.value ?? ""),
            now = parseFloat(nowBox?.value ?? "") || 0,
            vol = volBox ? parseInt(volBox.value, 10) : Number.NaN;
        if (Number.isFinite(total) && total > 0 && total !== b.total) quietPatch(b.id, { total });
        logProgress(b.id, now, { vol: Number.isFinite(vol) && vol !== b.vol ? vol : undefined });
    }
    const onEnter = (e: KeyboardEvent) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        logNow();
    };
    const dateOf = (v: string) => (v ? new Date(v + "T12:00:00").toISOString() : null);
    /** one field of one season */
    function season(i: number, f: string, v: string) {
        const S = (items.get(b.id)?.seasons || []).slice();
        S[i] = { ...S[i], [f]: f === "rating" ? parseFloat(v) || "" : f === "eps" ? parseInt(v, 10) || "" : v };
        patch(b.id, { seasons: S }, "Edit season");
    }
    const sessionMinutes = (x: Item) => x.log.reduce((a, s) => a + (s.min != null ? s.min : Math.max(0, (s.to || 0) - (s.from || 0)) * minutesPerUnit(x)), 0);
</script>

{#if b.medium !== "film"}<div class="sec"><p class="label">Progress</p>
        <div class="bar"><label class="ctl">{unit[0].charAt(0).toUpperCase() + unit[0].slice(1)} <input class="inp" id="pg-now" inputmode="decimal" style="width:84px" value={b.prog || 0} bind:this={nowBox} onkeydown={onEnter} /></label><span class="hint">of</span>
            <input class="inp" id="pg-total" inputmode="numeric" style="width:84px" placeholder={unit[1]} value={b.total || ""} bind:this={totalBox} onkeydown={onEnter} />
            {#if ["manga", "manhwa", "novel"].includes(b.medium)}<label class="ctl">Vol <input class="inp" id="pg-vol" inputmode="numeric" style="width:60px" value={b.vol || ""} bind:this={volBox} /></label>{/if}
            <button class="btn gold sm" data-act="log-save" onclick={logNow}>Log</button>{#each M.steps as n}<button class="btn sm" data-act="log-add" data-id={b.id} data-k={n}>+{n}{b.medium === "game" ? " h" : ""}</button>{/each}</div>
        {#if b.total}<div class="prog" style="margin-top:6px"><span style="width:{pct(b)}%"></span></div><p class="hint">{pct(b)}% · {left} {unit[1]} left{b.medium !== "game" ? " · about " + fmtHours(left * minutesPerUnit(b)) : ""}{paceText(b)}</p>{/if}</div>
{:else}<div class="sec"><p class="label">Watched?</p><div class="bar"><button class="btn gold sm" data-act="finish" data-id={b.id}>{b.status === "done" ? "Log another watch" : "Mark watched today"}</button><span class="hint">{b.runtime ? b.runtime + " minutes" : ""}</span></div></div>{/if}
{#if b.medium === "anime"}
    {@const n = Math.min(500, b.total || 0)}
    {#if n}<div class="sec"><p class="label">Episodes · {Math.min(b.prog || 0, n)} of {n}</p><div class="epgrid">{#each Array.from({ length: n }, (_, i) => i + 1) as e}<button data-act="ep-to" data-k={e} aria-pressed={(b.prog || 0) >= e} title="Watched up to episode {e}">{e}</button>{/each}</div></div>{/if}
{:else if b.medium === "tv"}
    {#if !b.ext.tvmaze}{#if b.ext.imdb}<div class="sec"><button class="btn sm" data-act="eps-load">Show episodes</button></div>{/if}
    {:else if !eps}<div class="sec"><div class="bar"><button class="btn sm" data-act="eps-load" disabled={m.busy === "eps"}>{m.busy === "eps" ? "Loading…" : "Track episodes"}</button><span class="hint">Season by season, from TVmaze.</span></div></div>
    {:else}<div class="sec"><p class="label">Episodes · {seen.size} of {m.eps?.length} watched</p>
            <div class="chips">{#each eps.S as s}<button class="chip" data-act="ep-season" data-k={s} aria-pressed={s === eps.cur} onclick={() => store.dialog({ season: s })}>S{s} <span class="cn">{eps.by[s].filter(e => seen.has(s + "x" + e.e)).length}/{eps.by[s].length}</span></button>{/each}</div>
            <div class="eplist">{#each eps.by[eps.cur] as e}{@const on = seen.has(eps.cur + "x" + e.e)}<button class="ep{on ? ' on' : ''}" data-act="ep-tog" data-k="{eps.cur}x{e.e}"><span class="en">{e.e}</span><span class="et">{e.title || "Episode " + e.e}<small>{fmtDate(e.date)}{e.runtime ? " · " + e.runtime + " min" : ""}</small></span><span class="ck">{on ? "✓" : ""}</span></button>{/each}</div>
            <div class="bar"><button class="linkbtn" data-act="ep-seasonall" data-k={eps.cur}>Mark S{eps.cur} watched</button></div></div>{/if}
{/if}
{#if ["tv", "anime"].includes(b.medium)}
    <!-- seasons: TV is scored as a whole unless you turn seasons on (per show, or for every show in Settings); anime seasons are already separate entries -->
    {#if !seasonsOn(b)}<div class="sec"><div class="bar"><button class="btn sm ghost" data-act="season-toggle">Score seasons separately</button><span class="hint">{b.medium === "anime" ? "AniList already keeps each anime season as its own entry." : "Off: this show is scored as a whole."}</span></div></div>
    {:else}<div class="sec"><p class="label">Seasons <button class="linkbtn" data-act="season-toggle">turn off</button></p>
            {#if seasons.S.length}<div class="seasons">{#each seasons.S as x, i}<div class="srow2"><b>S{x.n || i + 1}</b><input class="inp" data-season={i} data-sf="eps" value={x.eps || ""} placeholder="eps" inputmode="numeric" style="width:58px" onchange={e => season(i, "eps", e.currentTarget.value)} />
                            <select class="sel" data-season={i} data-sf="status" onchange={e => season(i, "status", e.currentTarget.value)}>{#each STATUS as k}<option value={k} selected={(x.status || "want") === k}>{words[k]}</option>{/each}</select>
                            <input class="inp" data-season={i} data-sf="rating" value={x.rating || ""} placeholder="/10" inputmode="decimal" style="width:58px" onchange={e => season(i, "rating", e.currentTarget.value)} /><input class="inp" data-season={i} data-sf="note" value={x.note || ""} placeholder="Note" onchange={e => season(i, "note", e.currentTarget.value)} /><button class="linkbtn" data-act="season-del" data-k={i} aria-label="Remove season">✕</button></div>{/each}</div>
            {:else}<p class="hint">No seasons yet.</p>{/if}
            <div class="bar" style="margin-top:6px"><button class="btn sm" data-act="season-add">+ Season</button>{#if seasons.avg != null}<button class="btn sm ghost" data-act="season-avg">Use the average ({seasons.avg}) as the overall score</button>{/if}</div></div>{/if}
{/if}
{#if b.medium === "game"}<div class="sec"><p class="label">How far</p><div class="status-seg wrap">{#each [["", "Not set"], ["story", "Main story"], ["extras", "Story + extras"], ["full", "100%"], ["endless", "Endless / multiplayer"]] as [k, l]}<button data-act="game-comp" data-k={k} aria-pressed={(b.completion || "") === k}>{l}</button>{/each}</div></div>{/if}
<div class="sec"><p class="label">Dates</p><div class="bar"><label class="ctl">Started <input class="inp" type="date" id="d-start" value={dayKey(b.startedAt)} style="width:auto" onchange={e => patch(b.id, { startedAt: dateOf(e.currentTarget.value) }, "Change start date")} /></label>
        <label class="ctl">{words.done} <input class="inp" type="date" id="d-finish" value={dayKey(b.finishedAt)} style="width:auto" onchange={e => patch(b.id, { finishedAt: dateOf(e.currentTarget.value) }, "Change finish date")} /></label>
        {#if b.status === "dnf"}<label class="ctl">Dropped <input class="inp" type="date" id="d-drop" value={dayKey(b.droppedAt)} style="width:auto" onchange={e => patch(b.id, { droppedAt: dateOf(e.currentTarget.value) }, "Change dropped date")} /></label>{/if}</div></div>
{#if reads.length || b.repeat}<div class="sec"><p class="label">History · {(b.repeat || 0) + 1} time{b.repeat ? "s" : ""}</p><div class="sessions">{#each reads as r, i}<div><span>{i + 1}</span><b>{fmtDate(r.startedAt) || "?"} → {fmtDate(r.finishedAt) || "?"}</b>{#if typeof r.rating === "number" && r.rating}<span>{fmtScore(r.rating, scaleOf({ scale: textOf(r.scale) }))}</span>{/if}</div>{/each}<div><span>{reads.length + 1}</span><b>{fmtDate(b.startedAt) || "?"} → {b.status === "done" ? fmtDate(b.finishedAt) || "?" : "now"}</b>{#if b.rating}<span>{fmtScore(b.rating, scaleOf(b))}</span>{/if}</div></div></div>{/if}
<div class="sec"><p class="label">Sessions · {log.length}{log.length ? " · ≈ " + fmtHours(sessionMinutes(b)) : ""}</p>{#if log.length}<div class="sessions">{#each log.slice(0, 40) as s, i}<div><span>{fmtDate(s.date)}</span><b>{b.medium === "game" ? (s.to || 0) - (s.from || 0) + " h" : b.medium === "book" ? `p. ${s.from} → ${s.to}` : b.medium === "film" ? "Watched" : `${unit[2]} ${s.from} → ${s.to}`}</b><button class="linkbtn" data-act="log-del" data-k={log.length - 1 - i}>remove</button></div>{/each}</div>{:else}<p class="hint">Nothing logged yet.</p>{/if}</div>
