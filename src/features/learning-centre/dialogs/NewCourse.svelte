<!--
    src/features/learning-centre/dialogs/NewCourse.svelte
    ─────────────────────────────────────────────────────────────────
      A new course (or more for the current one, "Fetch more"): type what you want to learn, a subject ("maths") or a
      topic ("propulsion"), and pick what the catalogue found. The course is built from it at once (lcFromCatalogue),
      opens, and its programmes' pages are fetched in the background (lcFetchAll). Nothing found: an empty course of
      that name. Which course "more" is for is the dialog's state (ui.modal.into); what's typed is this one's own.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { plural, textOf, toast } from "../../core/core";
    import { closeModal } from "../../core/modals";
    import DialogHead from "../../core/dialog/DialogHead.svelte";
    import { catFind, catName, catScope, catWhere, type CatHit } from "../catalogue/catalogue";
    import { lcNewCourse, lcPick, lcSub } from "../learning";
    import { lcFetchAll, lcFromCatalogue } from "../learning-build";
    import { goTab } from "../../core/navigation";

    const into = lcSub(textOf(store.ui.modal?.into));
    let q = $state("");
    const hits = $derived(
        catFind(q).map(h => {
            const s = catScope(h);
            return { h, name: catName(h), where: catWhere(h), books: s.books.length, progs: s.progs.length };
        })
    );

    function done(id: string, fetch: boolean) {
        closeModal();
        lcPick(id);
        goTab("learn");
        scrollTo(0, 0);
        if (fetch) void lcFetchAll(id);
    }
    function make(h: CatHit) {
        const nb = into ? into.books.length : 0,
            np = into ? into.progs.length : 0;
        const C = lcFromCatalogue(h, into);
        // what it brought, said as such: "Added 12 books and 3 programmes from Propulsion"
        if (into) {
            const b = C.books.length - nb,
                p = C.progs.length - np;
            toast(
                b || p
                    ? `Added ${[b ? plural(b, "book") : "", p ? plural(p, "programme") : ""].filter(Boolean).join(" and ")} from ${catName(h)}`
                    : `Nothing new from ${catName(h)}: the course has it all`
            );
        }
        done(C.id, true);
    }
    function empty() {
        const n = q.trim();
        if (!n) return;
        done(lcNewCourse(n.charAt(0).toUpperCase() + n.slice(1)).id, false);
    }
    function enter(e: KeyboardEvent) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (hits[0]) make(hits[0].h);
        else if (!into) empty();
    }
</script>

<DialogHead title={into ? `Fetch more for ${into.name}` : "New course"} />
<!-- svelte-ignore a11y_autofocus: what you want to learn is the first thing to type -->
<div class="fields"><div class="field full"><label for="lcn-q">{into ? "Another subject or topic to add" : "What do you want to learn?"}</label><input id="lcn-q" autocomplete="off" placeholder="e.g. maths, theoretical physics, propulsion" autofocus bind:value={q} onkeydown={enter}></div></div>
{#if hits.length}<div class="lchits">{#each hits as x, i (x.name + i)}<button class="lchit" data-act="lcn-pick" onclick={() => make(x.h)}><b>{x.name}</b><small>{x.where}</small><small>{x.books} books · {x.progs} programme{x.progs === 1 ? "" : "s"}</small></button>{/each}</div>
{:else if q.trim() && !into}<div class="bar"><span class="hint">Nothing in the catalogue for that yet.</span><button class="btn sm" data-act="lcn-empty" onclick={empty}>Start an empty course called “{q.trim()}”</button></div>
{:else if q.trim()}<p class="hint">Nothing in the catalogue for that yet. Add a programme from its page in Curricula instead.</p>{/if}
<p class="hint">{into ? "Its topics, books and programmes join this course; anything it already has stays as it is." : "The course is built at once from the standard books for each topic, by level and in the order to read them."} Then each programme's own pages are fetched for its modules and reading lists, in the background.</p>
