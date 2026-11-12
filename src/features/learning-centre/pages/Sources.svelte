<!--
    src/features/learning-centre/pages/Sources.svelte
    ─────────────────────────────────────────────────────────────────
      The best places to learn a course: seven at most, each a university, a certification or an independent one, with
      a link to check it (https only). "Add" is this section's own (it takes what's typed here); removing one is
      lc-src-del (learning-hub.ts). Below, searches to look them up.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { markDirty, toast } from "../../core/core";
    import type { Course } from "../../core/model";
    import { acId, lcSub } from "../learning";
    import { SRC_KINDS, SRC_MAX, sourcesLook } from "./look";

    let { S }: { S: Course } = $props();

    const L = $derived(sourcesLook(S));
    let kind = $state("uni"),
        name = $state(""),
        url = $state(""),
        note = $state("");

    function add() {
        const C = lcSub(S.id);
        if (!C) return;
        const n = name.trim(),
            u = url.trim();
        if (!n) return toast("Name it first.");
        if (u && !/^https:\/\//i.test(u)) return toast("Links need to start with https://");
        if ((C.sources || []).length >= SRC_MAX) return toast(`Seven at most: take one out first.`);
        C.sources = [...(C.sources || []), { id: acId(), kind: kind || "uni", name: n, url: u, note: note.trim() }];
        kind = "uni";
        name = url = note = "";
        markDirty();
    }
</script>

<section class="panel lcsrc"><h3 class="pwh">Best places to learn it <span class="hint">{L.rows.length}/{SRC_MAX}</span></h3>
    {#if L.rows.length}<div class="lcsrcs">{#each L.rows as x, i (i + x.id)}<div class="lcsr"><span class="pill">{x.kindName}</span><b>{x.name}</b>{#if x.note}<small>{x.note}</small>{/if}{#if x.url}<a class="link" href={x.href} target="_blank" rel="noopener noreferrer">Check ↗</a>{:else}<span class="hint">no link yet</span>{/if}<button class="linkbtn" data-act="lc-src-del" data-k={x.id} aria-label="Remove {x.name}">✕</button></div>{/each}</div>{:else}<p class="hint">The few places that teach {S.name.toLowerCase()} best: universities, certifications that count, and independent courses or books. Seven at most, so each one earns its place.</p>{/if}
    {#if L.rows.length < SRC_MAX}<div class="bar lcsrcadd"><select class="sel" id="lc-src-kind" aria-label="Kind" bind:value={kind}>{#each SRC_KINDS as [k, l]}<option value={k}>{l}</option>{/each}</select><input class="inp" id="lc-src-name" placeholder="Name (e.g. Cambridge, Part III)" aria-label="Name" bind:value={name}><input class="inp" id="lc-src-url" placeholder="https://… (to check it)" aria-label="Link" bind:value={url}><input class="inp" id="lc-src-note" placeholder="Why it's here" aria-label="Why" bind:value={note}><button class="btn sm" data-act="lc-src-add" data-k={S.id} onclick={add}>Add</button></div>{/if}
    <p class="hint">Look it up: {#each L.look as [l, u], i}{i ? " · " : ""}<a class="link" href={u} target="_blank" rel="noopener noreferrer">{l} ↗</a>{/each}</p></section>
