<!--
    src/features/library/add/AddSearch.svelte
    ─────────────────────────────────────────────────────────────────
      Add's first step: the medium, what to search for (and its type), and what the catalogue found. Picking a result
      fills in its details and goes on to the form; "Enter it myself" goes straight there.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { caretAtStart } from "../../core/dialog/caret";
    import { store } from "../../core/store.svelte";
    import { isCandidate, KEYS, kindsOf, MEDIA, MEDIA_KEYS, vault } from "../../core/core";
    import { focusDialog } from "../../core/modals";
    import { candidateDetails, sourceFor } from "../../sources/sources";
    import { IGDB_ON } from "../../sources/igdb";
    import { TMDB_ON } from "../../sources/proxy";
    import DialogHead from "../../core/dialog/DialogHead.svelte";
    import Pic from "../../core/dialog/Pic.svelte";
    import { draftFrom, EXAMPLE, haveIt, searchFor } from "./add";
    import type { Modal } from "../../core/model";

    let { m }: { m: Modal } = $props();

    // what you've typed, ticked and chosen: kept when you pick another medium
    // svelte-ignore state_referenced_locally
    let q = $state(m.q || ""),
        ikind = $state(m.ikind || ""),
        priv = $state(!!m.private);
    const med = $derived(m.medium || "book");
    const kinds = $derived.by(() => {
        void store.ui;
        return kindsOf(med);
    });
    const keyless = $derived(["film", "tv", "game"].includes(med) && !(med === "game" ? KEYS.rawg || IGDB_ON() : TMDB_ON()));

    /** move on (another medium, the form): drawn at once, with focus where the dialog wants it */
    function go(change: Partial<Modal>) {
        store.dialog(change);
        store.flush();
        focusDialog();
    }
    function medium(k: string) {
        ikind = "";
        go({ medium: k, ikind: "", results: null, error: "" });
    }
    async function search() {
        const live = store.ui.modal;
        store.dialog({ q: q.trim(), ikind, private: priv });
        if (!q.trim()) {
            store.dialog({ error: "Type a title." });
            return;
        }
        store.dialog({ busy: true, error: "" });
        const r = await searchFor(med, q.trim());
        store.dialog({ busy: false, ...("error" in r ? { error: r.error } : { results: r.results }) }, live);
    }
    async function pick(i: number) {
        const c = m.results?.[i],
            live = store.ui.modal;
        if (!isCandidate(c)) return;
        store.dialog({ busy: true });
        const d = await candidateDetails(c);
        if (live !== store.ui.modal) return;
        go({ step: "review", busy: false, coverData: "", q, ikind, private: priv, draft: draftFrom(d, med, ikind) });
    }
    function manual() {
        go({ step: "review", coverData: "", q, ikind, private: priv, draft: { title: q.trim(), medium: m.medium, kind: ikind || (m.medium === "book" ? "Novel" : ""), status: "want", copy: "none" } });
    }
</script>

{#snippet privBox()}{#if vault.key}<label class="ctl"><input type="checkbox" id="a-private" bind:checked={priv}> 🔒 Private</label>{/if}{/snippet}
<DialogHead title={m.private ? "Add a private entry" : "Add anything"} />
<div class="chips mchips" role="group" aria-label="Medium">{#each MEDIA_KEYS as k}<button class="chip" data-act="add-medium" data-k={k} aria-pressed={med === k} onclick={() => medium(k)}><span class="mg">{MEDIA[k].g}</span>{MEDIA[k].name}</button>{/each}</div>
<!-- svelte-ignore a11y_autofocus: the search box is where you start -->
<div class="fields"><div class="field full"><label for="a-q">{med === "book" ? "Title, author or ISBN" : "Title"}</label><input id="a-q" autofocus placeholder={EXAMPLE[med]} bind:value={q} use:caretAtStart onkeydown={e => { if (e.key === "Enter") { e.preventDefault(); search(); } }}></div>
    <div class="field"><label for="a-kind">Type</label><select id="a-kind" onchange={e => (ikind = e.currentTarget.value)}><option value="">Decide from the source</option>{#each kinds as k}<option selected={ikind === k}>{k}</option>{/each}</select></div></div>
<div class="bar"><button class="btn gold" data-act="add-search" disabled={!!m.busy} onclick={search}>{m.busy ? "Searching…" : "Search " + sourceFor(med)}</button><button class="btn ghost" data-act="add-manual" onclick={manual}>Enter it myself</button>{@render privBox()}
    {#if keyless}<span class="hint">Add a free {med === "game" ? "RAWG" : "TMDB"} key in Settings for posters, cast and better matches.</span>{/if}</div>
{#if m.error}<p class="err">{m.error}</p>{/if}
{#if m.results}{#if m.results.length}<div class="cands">{#each m.results as c, i}{#if isCandidate(c)}{@const mark = haveIt(c, med)}<button class="cand" data-act="add-pick" data-k={i} onclick={() => pick(i)}>{#if c.cover}<Pic src={c.cover} />{:else}<span class="nocov">No picture</span>{/if}<span class="t">{c.title}</span><span class="hint">{[c.kind || MEDIA[c.medium || med].one, c.year, c.total && ["anime", "tv"].includes(c.medium || med) ? c.total + " eps" : "", c.creator].filter(Boolean).join(" · ")}</span>{#if mark}<span class="pill own">{mark}</span>{/if}</button>{/if}{/each}</div>{:else}<p class="hint">No matches. Try fewer words, or enter it yourself.</p>{/if}{/if}
