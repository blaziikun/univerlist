<!--
    src/features/library/profile/ProfileEdit.svelte
    ─────────────────────────────────────────────────────────────────
      Edit profile: your name, picture, bio and banner, everywhere or only in one mode. Each mode can have its own; one
      left empty uses your main one. Which profile it edits is the dialog's state (ui.modal.mode, .origin, .scope), and
      changes with "pe-scope" (library/profile-handlers.ts); the boxes (ProfileFields) start afresh when it does.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { curMode, modeById } from "../../core/core";
    import DialogHead from "../../core/dialog/DialogHead.svelte";
    import ProfileFields from "./ProfileFields.svelte";

    const v = $derived.by(() => {
        const m = store.ui.modal;
        if (!m || m.kind !== "profile-edit") return null;
        void store.meta;
        const mode = modeById(m.mode || curMode().id),
            origin = modeById(m.origin || m.mode || curMode().id);
        return {
            mode: mode.id,
            name: mode.name,
            origin: { id: origin.id, name: origin.name },
            scope: m.scope || (mode.id === "universal" ? "all" : "mode"),
        };
    });
</script>

{#if v}
    <DialogHead title={`Edit profile · ${v.scope === "all" ? "everywhere" : v.name + " only"}`} />
    {#if v.origin.id === "universal"}<p class="hint scopehint">This is your profile everywhere. To give a mode its own, open this from that mode and choose “Only in…”.</p>{:else}<div class="scopebar"><div class="seg"><button data-act="pe-scope" data-k="all" aria-pressed={v.scope === "all"}>Same everywhere</button><button data-act="pe-scope" data-k="mode" aria-pressed={v.scope === "mode"}>Only in {v.origin.name}</button></div><span class="hint">{v.scope === "all" ? "You're editing the profile every mode uses unless it has its own." : v.origin.name + " keeps its own picture, banner, name and bio; the rest of the app is unchanged."}</span></div>{/if}
    {#key v.mode}<ProfileFields mode={v.mode} />{/key}
{/if}
