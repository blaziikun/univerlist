<!--
    src/features/library/card/JournalTab.svelte
    ─────────────────────────────────────────────────────────────────
      The item card's Journal (a book), Diary (a film or show), Log (a game) or Notes (an album): entries as you go,
      and the quotes or moments worth keeping, newest first
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { change, fmtDate, MEDIA, nowISO, unitOf } from "../../core/core";
    import { journalName } from "../item";
    import type { Entry } from "../../core/model";

    let { b }: { b: Entry } = $props();

    const abbr = $derived(unitOf(b)[2]);
    const group = $derived(MEDIA[b.medium].group);
    const journal = $derived(b.journal.map((j, i) => ({ ...j, i })).reverse());
    const quotes = $derived(b.quotes.map((q, i) => ({ ...q, i })).reverse());

    let entry = $state(""),
        quote = $state(""),
        page = $state("");
    function addEntry() {
        const text = entry.trim();
        if (!text) return;
        change("Add journal entry", b.id, x => (x ? { ...x, journal: [...x.journal, { text, date: nowISO() }] } : undefined));
        entry = "";
    }
    function addQuote() {
        const text = quote.trim();
        if (!text) return;
        const at = page.trim();
        change("Add quote", b.id, x => (x ? { ...x, quotes: [...x.quotes, { text, page: at, date: nowISO() }] } : undefined));
        quote = "";
        page = "";
    }
</script>

<div class="sec"><p class="label">New {journalName(b).toLowerCase()} entry</p><textarea id="jr-text" placeholder={group === "read" ? "What you're thinking as you go" : group === "watch" ? "What you thought of it, this time" : "Where you are, what you think so far"} style="min-height:70px" bind:value={entry}></textarea><div class="bar"><button class="btn sm gold" data-act="journal-add" onclick={addEntry}>Add entry</button></div>
    {#each journal as j}<div class="entry"><small>{fmtDate(j.date)} · <button class="linkbtn" data-act="journal-del" data-k={j.i}>remove</button></small><p>{j.text}</p></div>{/each}</div>
<div class="sec"><p class="label">{group === "read" ? "Save a quote" : "Save a quote or moment"}</p><textarea id="qt-text" placeholder="A line or scene worth keeping" style="min-height:60px" bind:value={quote}></textarea>
    <div class="bar"><label class="ctl">{abbr || "At"} <input class="inp" id="qt-page" style="width:80px" bind:value={page} /></label><button class="btn sm gold" data-act="quote-add" onclick={addQuote}>Save</button></div>
    {#each quotes as q}<div class="quote">{q.text}<small>{q.page ? abbr + " " + q.page + " · " : ""}{fmtDate(q.date)} · <button class="linkbtn" data-act="quote-del" data-k={q.i}>remove</button></small></div>{/each}</div>
