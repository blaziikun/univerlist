<!--
    src/features/library/entry/EntryFields.svelte
    ─────────────────────────────────────────────────────────────────
      The entry form: title, creator, medium, type, status, year, length, ownership, genres and the rest. Add shows it
      once you've picked a result (or chosen to enter it yourself), and the item card's Edit details shows it for the
      entry. The boxes are the caller's (bind:boxes, made by boxesOf in fields.ts), kept as typed; readFields() reads
      them back. Picking another medium shows its own boxes (volumes, runtime, hours to beat) and keeps the rest.
      p: the prefix of the boxes' ids (a- in Add, e- in Edit details), which the tests and labels use.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { caretAtStart } from "../../core/dialog/caret";
    import { store } from "../../core/store.svelte";
    import { COPY, FICTION_LANES, FORMATS, KINDS, kindsOf, MEDIA, MEDIA_KEYS, STATUS, STATUS_WORDS, SUBJECT_ORDER } from "../../core/core";
    import { ownWord } from "../item";
    import { CREATOR_LABEL, shows, type Boxes } from "./fields";

    let { boxes = $bindable(), p, autofocus = false }: { boxes: Boxes; p: string; autofocus?: boolean } = $props();

    const med = $derived(boxes.medium || "book");
    const M = $derived(MEDIA[med]);
    const S = $derived(shows(med));
    // what you've typed elsewhere in the library, offered as you type
    const known = $derived.by(() => {
        const L = [...store.items.values()];
        return {
            subjects: [...new Set([...SUBJECT_ORDER.filter(s => !FICTION_LANES.includes(s)), ...L.map(b => b.subject).filter(Boolean)])],
            series: [...new Set(L.map(x => x.series).filter(Boolean))],
        };
    });
    const kinds = $derived.by(() => {
        void store.ui; // the private collection has kinds of its own
        return kindsOf(med);
    });
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
</script>

{#snippet choose(id: string, opts: [string, string][], key: keyof Boxes, first?: [string, string])}
    <select id={p + id} onchange={e => (boxes[key] = e.currentTarget.value)}>{#if first}<option value={first[0]}>{first[1]}</option>{/if}{#each opts as [k, l]}<option value={k} selected={k === boxes[key]}>{l}</option>{/each}</select>
{/snippet}

<div class="fields">
    <!-- svelte-ignore a11y_autofocus: the title is where you start (focusDialog() moves focus to it) -->
    <div class="field full"><label for="{p}title">Title</label><input id="{p}title" bind:value={boxes.title} {autofocus} use:caretAtStart></div>
    <div class="field"><label for="{p}creator">{CREATOR_LABEL[med]}</label><input id="{p}creator" bind:value={boxes.creator}></div>
    <div class="field"><label for="{p}medium">Medium</label>{@render choose("medium", MEDIA_KEYS.map((k): [string, string] => [k, MEDIA[k].name]), "medium")}</div>
    <div class="field"><label for="{p}kind">Type</label><input id="{p}kind" list="{p}kinds" bind:value={boxes.kind} placeholder={KINDS[med][0]}><datalist id="{p}kinds">{#each kinds as k}<option value={k}></option>{/each}</datalist></div>
    <div class="field"><label for="{p}status">Status</label>{@render choose("status", STATUS.map((k): [string, string] => [k, STATUS_WORDS[M.group][k]]), "status")}</div>
    <div class="field"><label for="{p}year">Year</label><input id="{p}year" inputmode="numeric" bind:value={boxes.year}></div>
    {#if S.total}<div class="field"><label for="{p}total">{med === "game" ? "Hours to beat" : cap(M.unit[1])}</label><input id="{p}total" inputmode="numeric" bind:value={boxes.total}></div>{/if}
    {#if S.runtime}<div class="field"><label for="{p}runtime">{med === "film" ? "Runtime (min)" : "Minutes per episode"}</label><input id="{p}runtime" inputmode="numeric" bind:value={boxes.runtime}></div>{/if}
    {#if S.vols}<div class="field"><label for="{p}vols">Volumes</label><input id="{p}vols" inputmode="numeric" bind:value={boxes.vols}></div>{/if}
    <div class="field"><label for="{p}copy">Ownership</label>{@render choose("copy", COPY.map(([k]): [string, string] => [k, ownWord({ medium: med }, k)]), "copy")}</div>
    <div class="field"><label for="{p}genres">Genres</label><input id="{p}genres" bind:value={boxes.genres} placeholder="Comma separated"></div>
    <div class="field"><label for="{p}franchise">Franchise</label><input id="{p}franchise" bind:value={boxes.franchise}></div>
    <div class="field"><label for="{p}chrono">Place in the story</label><input id="{p}chrono" inputmode="decimal" bind:value={boxes.chrono} placeholder="for story order (1, 2, 2.5…)"></div>
    {#if S.book}<div class="field"><label for="{p}subject">Subject</label><input id="{p}subject" list="subj-list" bind:value={boxes.subject} placeholder="For academic and non-fiction"><datalist id="subj-list">{#each known.subjects as s}<option value={s}></option>{/each}</datalist></div>
        <div class="field"><label for="{p}format">Length</label>{@render choose("format", FORMATS.map((k): [string, string] => [k, k]), "format", ["", "Unknown"])}</div>{/if}
    {#if S.series}<div class="field"><label for="{p}series">Series</label><input id="{p}series" list="series-l" bind:value={boxes.series} placeholder="e.g. The Stormlight Archive"><datalist id="series-l">{#each known.series as x}<option value={x}></option>{/each}</datalist></div>
        <div class="field"><label for="{p}seriesNo">Number in series</label><input id="{p}seriesNo" inputmode="decimal" bind:value={boxes.seriesNo} placeholder="1"></div>{/if}
    <div class="field full"><label for="{p}about">What it is</label><textarea id="{p}about" bind:value={boxes.about}></textarea></div>
    <div class="field full"><label for="{p}why">Why it's for you</label><textarea id="{p}why" bind:value={boxes.why}></textarea></div>
    <div class="field full"><label for="{p}cw">Content note</label><input id="{p}cw" bind:value={boxes.cw}></div>
</div>
