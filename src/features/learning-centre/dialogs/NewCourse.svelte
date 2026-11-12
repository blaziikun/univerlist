<!--
    src/features/learning-centre/dialogs/NewCourse.svelte
    ─────────────────────────────────────────────────────────────────
      From a university's page: the course (or a new one), the university, the programme, the link to its programme or
      module list, and a summary. "Fetch from the link" saves them and goes on to fetch (FetchFromLink); "Just save
      these" only saves (lcCreate, learning.ts). Opened by "lc-newpath" on the Courses page, for the course you're on.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { textOf } from "../../core/core";
    import DialogHead from "../../core/dialog/DialogHead.svelte";
    import { lcCreate, LSUBS } from "../learning";

    const courses = $derived.by(() => {
        void store.meta;
        return LSUBS().map(s => ({ id: s.id, name: s.name }));
    });
    let form = $state({ sub: textOf(store.ui.modal?.sub) || "+", subNew: "", uni: "", programme: "", url: "", about: "" });
</script>

<DialogHead title="From a university's page" />
<!-- svelte-ignore a11y_autofocus: a new course's name is the first thing to type -->
<div class="fields">
    <div class="field"><label for="lcn-sub">Course</label><select class="sel" id="lcn-sub" bind:value={form.sub}>{#each courses as s (s.id)}<option value={s.id}>{s.name}</option>{/each}<option value="+">A new course…</option></select></div>
    <div class="field"><label for="lcn-subnew">New course's name</label><input id="lcn-subnew" placeholder="e.g. Aeronautics (only for a new one)" autofocus bind:value={form.subNew}></div>
    <div class="field"><label for="lcn-uni">University</label><input id="lcn-uni" placeholder="e.g. Imperial College London" bind:value={form.uni}></div>
    <div class="field"><label for="lcn-prog">Programme or course</label><input id="lcn-prog" placeholder="e.g. Aeronautical Engineering MEng" bind:value={form.programme}></div>
    <div class="field full"><label for="lcn-url">Link to its programme or module list</label><input id="lcn-url" placeholder="https://…" bind:value={form.url}></div>
    <div class="field full"><label for="lcn-about">Summary (optional)</label><textarea id="lcn-about" rows="2" placeholder="What it's for, where it gets you" bind:value={form.about}></textarea></div></div>
<div class="bar"><button class="btn gold" data-act="lc-create" data-k="fetch" onclick={() => lcCreate(form, true)}>Fetch from the link</button><button class="btn" data-act="lc-create" data-k="" onclick={() => lcCreate(form, false)}>Just save these</button></div>
<p class="hint">Everything can be changed afterwards, and more can be fetched any time (a reading list per module, say).</p>
