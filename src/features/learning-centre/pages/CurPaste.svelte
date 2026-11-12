<!--
    src/features/learning-centre/pages/CurPaste.svelte
    ─────────────────────────────────────────────────────────────────
      Paste a programme into Curricula: its university, name, why it's here and whether it's a specialist one, and its
      module list (one per line, ★ for compulsory, books after a dash). "Add" is this one's own; Cancel closes it
      (uni-paste).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { plural, toast, ui } from "../../core/core";
    import { store } from "../../core/store.svelte";
    import { uniAddProgramme, uniPasted } from "../learning-curricula";

    let { sid }: { sid: string } = $props();

    let f = $state({ uni: "", name: "", why: "", spec: false, text: "" });

    function save() {
        const uni = f.uni.trim();
        if (!uni || !f.text.trim()) return toast("Add the university and at least one module.");
        const n = uniAddProgramme(sid, {
            uni,
            name: f.name.trim(),
            why: f.why.trim(),
            kind: f.spec ? "specialist" : "mine",
            modules: uniPasted(f.text),
        });
        ui.uniPaste = false;
        store.flush("ui");
        toast(`Added ${uni}: ${plural(n, "module")}`);
    }
</script>

<section class="panel unipaste"><h3>Paste a programme</h3><p class="hint">Copy its module list from the university's page. One module per line; put books after a dash, separated by semicolons: <code>Algebraic Topology — Hatcher, Algebraic Topology; Bott &amp; Tu</code>. A ★ at the start marks it compulsory. Each module is matched to topics by name (and becomes a topic itself if nothing matches).</p>
    <div class="bar"><input class="inp" id="up-uni" placeholder="University" style="max-width:200px" bind:value={f.uni}><input class="inp" id="up-name" placeholder="Programme" style="max-width:260px" bind:value={f.name}><input class="inp" id="up-why" placeholder="Why this one (optional)" style="flex:1" bind:value={f.why}><label class="ctl"><input type="checkbox" id="up-spec" bind:checked={f.spec}> Specialist</label></div>
    <textarea class="inp" id="up-text" rows="8" placeholder="★ Module — Book; Book" bind:value={f.text}></textarea><div class="bar"><button class="btn sm gold" data-act="uni-save" onclick={save}>Add</button><button class="btn sm ghost" data-act="uni-paste">Cancel</button></div></section>
