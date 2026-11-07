<!--
    src/features/backdrops/Backdrops.svelte
    ─────────────────────────────────────────────────────────────────
      Settings › Backdrops (beta): make your own moving background

      Start from one of the ready ones (or blank), change it while it plays behind the page, save it, then "Use it" puts it
      on the theme you're using. "Save as file" gives you a small .ulbackdrop file to share; "Open a backdrop file" takes one in
      (checked first: a backdrop is only shapes, colours and a picture, see backdrop.ts). Your backdrops are kept in your settings,
      so they sync and back up with everything else. Shown when the Backdrop builder is on (Settings › Extensions).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { onDestroy } from "svelte";
    import { store } from "../core/store.svelte";
    import LayerControls from "./LayerControls.svelte";
    import { pictureFrom } from "./picture";
    import { cleanLayer, cleanBackdrop, fromFile, MAX_LAYERS, MAX_BACKDROPS, MOTIONS, myBackdrops, newId, STARTERS, toFile, type Backdrop } from "./backdrop";
    import { done, preview } from "./backdrop-layer";

    const backdrops = $derived(myBackdrops(store.meta.settings.backdrops));
    const using = $derived.by(() => {
        void store.meta;
        return String(modeTheme().backdrop || "");
    });
    let draft = $state<Backdrop | null>(null),
        isNew = $state(false),
        err = $state("");
    // the hidden file pickers (for a picture, and for a backdrop file)
    let picker = $state<HTMLInputElement>(),
        opener = $state<HTMLInputElement>();

    // the backdrop you're editing plays behind the page as you change it
    $effect(() => {
        preview(draft ? cleanBackdrop($state.snapshot(draft)) : null);
    });
    onDestroy(done);

    function save(list: Backdrop[], label: string) {
        changeMeta(label, "settings", s => ({ ...s, backdrops: list }));
    }
    function start(make: () => Omit<Backdrop, "id">) {
        if (backdrops.length >= MAX_BACKDROPS) return void (err = `You can keep ${MAX_BACKDROPS} backdrops. Delete one to make another.`);
        err = "";
        draft = { id: newId(), ...make() };
        isNew = true;
    }
    function edit(w: Backdrop) {
        err = "";
        draft = structuredClone(w);
        isNew = false;
    }
    function keep() {
        if (!draft) return;
        const w = cleanBackdrop($state.snapshot(draft));
        save(isNew ? [...backdrops, w] : backdrops.map(x => (x.id === w.id ? w : x)), isNew ? `Make backdrop “${w.name}”` : `Change backdrop “${w.name}”`);
        draft = null;
        toast(`Saved “${w.name}”`, { label: "Use it", fn: () => use(w) });
    }
    function use(w: Backdrop) {
        setThemeVal("backdrop", "mine:" + w.id);
        renderSide();
        toast(`“${w.name}” is behind this theme now`);
    }
    function remove(w: Backdrop) {
        save(
            backdrops.filter(x => x.id !== w.id),
            `Delete backdrop “${w.name}”`
        );
        toast(`Deleted “${w.name}”`, { label: "Undo", fn: undo });
    }
    function share(w: Backdrop) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([toFile(w)], { type: "application/json" }));
        a.download = (w.name.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "backdrop") + ".ulbackdrop";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    async function openFile(f: File | undefined) {
        opener!.value = "";
        if (!f) return;
        err = "";
        if (f.size > 1_000_000) return void (err = "That file is too big to be a backdrop.");
        try {
            const w = fromFile(await f.text());
            if (backdrops.length >= MAX_BACKDROPS) return void (err = `You can keep ${MAX_BACKDROPS} backdrops. Delete one to open another.`);
            draft = w;
            isNew = true;
        } catch (e) {
            err = (e as Error).message;
        }
    }
    async function choosePicture(f: File | undefined) {
        picker!.value = "";
        if (!f || !draft) return;
        err = "";
        try {
            draft.picture = { src: await pictureFrom(f), opacity: draft.picture?.opacity ?? 0.6, blur: draft.picture?.blur ?? 0, motion: draft.picture?.motion ?? "pan" };
        } catch (e) {
            err = (e as Error).message;
        }
    }
</script>

<h2 class="sh">Backdrops <span class="pill">Beta</span></h2>
<p class="hint" style="margin-bottom:12px">
    Make your own moving background from shapes, drifting particles and a picture of your own, and put it behind any theme. It's drawn on your
    device and follows your motion setting (Calm, Alive or Still, in Library & views). Share one as a small file.
</p>

{#if err}<p class="err" role="alert">{err}</p>{/if}

{#if draft}
    <div class="panel wedit">
        <h3>{isNew ? "A new backdrop" : "Changing a backdrop"} <span class="hint">it's playing behind this page as you change it</span></h3>
        <label class="ctl">Name <input class="inp" maxlength="40" bind:value={draft.name} /></label>

        <h4>Sky</h4>
        <div class="bar">
            <label class="ctl"><input type="radio" name="wsky" checked={!draft.sky} onchange={() => draft && (draft.sky = null)} /> The theme's background</label>
            <label class="ctl"><input type="radio" name="wsky" checked={!!draft.sky} onchange={() => draft && (draft.sky = draft.sky || ["#0b0d18", "#1a1030"])} /> Two colours, top to bottom</label>
            {#if draft.sky}
                <input type="color" bind:value={draft.sky[0]} aria-label="Sky colour at the top" />
                <input type="color" bind:value={draft.sky[1]} aria-label="Sky colour at the bottom" />
            {/if}
        </div>

        <h4>Picture</h4>
        <div class="bar">
            <button class="btn sm" onclick={() => picker?.click()}>{draft.picture ? "Choose another picture…" : "Choose a picture…"}</button>
            <input type="file" accept="image/*" hidden bind:this={picker} onchange={e => choosePicture(e.currentTarget.files?.[0])} />
            {#if draft.picture}
                <button class="btn sm ghost" onclick={() => draft && (draft.picture = null)}>Remove picture</button>
                <label class="ctl rangec"><span>Strength</span><input type="range" min="0" max="1" step="0.05" bind:value={draft.picture.opacity} /><output>{Math.round(draft.picture.opacity * 100)}%</output></label>
                <label class="ctl rangec"><span>Blur</span><input type="range" min="0" max="20" step="1" bind:value={draft.picture.blur} /><output>{draft.picture.blur} px</output></label>
                <label class="ctl">Movement
                    <select class="sel" bind:value={draft.picture.motion}>
                        {#each MOTIONS as m (m)}<option value={m}>{({ still: "Still", pan: "Slow pan", zoom: "Slow breathing" })[m]}</option>{/each}
                    </select>
                </label>
            {:else}<span class="hint">Optional. It's made smaller on your device first, and nothing else from the file is kept.</span>{/if}
        </div>

        <h4>Moving shapes</h4>
        {#each draft.layers as _, i (i)}
            <LayerControls bind:layer={draft.layers[i]} n={i + 1} onremove={() => draft && draft.layers.splice(i, 1)} />
        {/each}
        {#if draft.layers.length < MAX_LAYERS}
            <button class="btn sm" onclick={() => draft && draft.layers.push(cleanLayer({}))}>Add a layer of shapes</button>
        {:else}<p class="hint">Four layers is the most, to keep it light.</p>{/if}

        <div class="bar" style="margin-top:14px">
            <button class="btn primary" onclick={keep}>Save</button>
            <button class="btn ghost" onclick={() => (draft = null)}>Cancel</button>
        </div>
    </div>
{:else}
    <div class="panel">
        <h3>Your backdrops</h3>
        {#if backdrops.length}
            <div class="wlist">
                {#each backdrops as w (w.id)}
                    <div class="bar">
                        <b class="wname">{w.name}</b>
                        {#if using === "mine:" + w.id}<span class="pill">On this theme</span>{:else}<button class="btn sm" onclick={() => use(w)}>Use it</button>{/if}
                        <button class="btn sm ghost" onclick={() => edit(w)}>Change</button>
                        <button class="btn sm ghost" onclick={() => share(w)}>Save as file</button>
                        <button class="btn sm ghost" onclick={() => remove(w)}>Delete</button>
                    </div>
                {/each}
            </div>
        {:else}<p class="hint">None yet. Start from one of these, and change anything.</p>{/if}
        <div class="bar" style="margin-top:12px">
            <span class="hint">New, from:</span>
            {#each STARTERS as s (s.name)}<button class="btn sm" onclick={() => start(s.make)}>{s.name}</button>{/each}
        </div>
        <div class="bar" style="margin-top:8px">
            <button class="btn sm ghost" onclick={() => opener?.click()}>Open a backdrop file…</button>
            <input type="file" accept=".ulbackdrop,.ulworld,application/json" hidden bind:this={opener} onchange={e => openFile(e.currentTarget.files?.[0])} />
            <span class="hint">To go back to a built-in backdrop, pick one under Appearance › Backdrop.</span>
        </div>
    </div>
{/if}

<style>
    .wedit h4 { margin: 16px 0 6px; font-size: 14px; }
    .wedit > .ctl { max-width: 360px; }
    .wlist { display: flex; flex-direction: column; gap: 6px; }
    .wname { min-width: 140px; }
</style>
