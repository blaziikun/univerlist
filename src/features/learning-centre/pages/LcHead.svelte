<!--
    src/features/learning-centre/pages/LcHead.svelte
    ─────────────────────────────────────────────────────────────────
      The Learning Centre's bar, on Courses and Curricula: which course (the switcher; "All courses" is the hub), making
      it the one the Learning Centre opens on (lc-default), and a new course (lc-new). Picking a course here makes it
      the current one everywhere in the Learning Centre.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { switchLook } from "./look";

    let { cur, hub = true }: { cur: string; hub?: boolean } = $props();

    const v = $derived.by(() => {
        void store.meta;
        return switchLook(cur);
    });
    // a course, or "" for all of them
    function pick(id: string) {
        store.go(id ? { learnSub: id, lcHub: false, learnDel: null, lcOpen: null } : { lcHub: true, learnDel: null });
        scrollTo(0, 0);
    }
</script>

<div class="lcbar">{#if v.options.length}<label class="lcsw"><span class="lcswk">Course</span><select class="sel" id="lc-switch" value={cur} onchange={e => pick(e.currentTarget.value)}>{#if !cur}<option value="">All courses</option>{/if}{#each v.options as o (o.id)}<option value={o.id}>{o.name}</option>{/each}{#if cur && hub}<option value="">All courses…</option>{/if}</select></label>
    {#if cur}{#if v.isDefault}<span class="pill lcdef" title="The Learning Centre opens on this course">Default</span>{:else}<button class="btn sm ghost" data-act="lc-default">Make default</button>{/if}{/if}{/if}
    <span class="spacer"></span><button class="btn sm gold" data-act="lc-new" data-k="">+ New course</button></div>
