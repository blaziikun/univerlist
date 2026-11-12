<!--
    src/features/learning-centre/pages/CurTopics.svelte
    ─────────────────────────────────────────────────────────────────
      A course's Curricula topics, grouped by area: each topic's area and name edited in place, removed (uni-topic-del),
      and "Area — Topic" added with Enter. Programmes' modules are matched to them by name.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { markDirty } from "../../core/core";
    import type { Curriculum } from "../../core/model";
    import { acId } from "../learning";
    import { curS } from "../learning-curricula";

    let { sid, S }: { sid: string; S: Curriculum } = $props();

    // an area may be emptied; a topic's name may not
    function set(id: string, f: "area" | "name", value: string) {
        const x = curS(sid).topics.find(y => y.id === id),
            v = value.trim();
        if (!x || (!v && f === "name")) return;
        x[f] = v;
        markDirty();
    }
    function add(e: KeyboardEvent & { currentTarget: HTMLInputElement }) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const v = e.currentTarget.value.trim();
        if (!v) return;
        const [a, n] = v.includes("—") || / - /.test(v) ? v.split(/\s+[—–-]\s+/) : ["Topics", v];
        curS(sid).topics.push({ id: "t" + acId(), name: (n || a).trim(), area: n ? a.trim() : "Topics" });
        e.currentTarget.value = "";
        markDirty();
    }
</script>

<section class="panel unitopics"><h3>Topics <span class="hint">grouped by area · modules are matched to them by name</span>{#if S.topics.length}<button class="linkbtn" data-act="uni-topics" style="margin-left:auto">Done</button>{/if}</h3>
    <div class="unitop">{#each S.topics as t, i (i + t.id)}<span class="topic"><input class="inp" data-unitopic={t.id} data-f="area" value={t.area || ""} placeholder="Area" aria-label="Area" style="width:120px" onchange={e => set(t.id, "area", e.currentTarget.value)}><input class="inp" data-unitopic={t.id} data-f="name" value={t.name} aria-label="Topic" style="width:220px" onchange={e => set(t.id, "name", e.currentTarget.value)}><button class="linkbtn" data-act="uni-topic-del" data-k={t.id} aria-label="Remove">✕</button></span>{/each}</div>
    <div class="bar"><input class="inp" placeholder="+ topic: Area — Topic, e.g. Analysis — Real analysis (press Enter)" data-unitopicadd="1" style="flex:1;max-width:520px" onkeydown={add}></div></section>
