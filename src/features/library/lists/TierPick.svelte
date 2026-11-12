<!--
    src/features/library/lists/TierPick.svelte
    ─────────────────────────────────────────────────────────────────
      Add what you've selected to a tier list: each tier list with its tiers to drop them into ("tp-place"), or a new
      tier list with them ("tier-new-from-sel"), both in library/list-handlers.ts.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import DialogHead from "../../core/dialog/DialogHead.svelte";

    const v = $derived.by(() => {
        const m = store.ui.modal;
        if (!m || m.kind !== "tierpick") return null;
        return { n: (m.ids || []).length, T: store.meta.lists.filter(t => t.kind === "tier" && !t.chars).map(t => ({ ...t, rows: (t.rows || []).map(r => ({ ...r })) })) };
    });
</script>

{#if v}
    <DialogHead title="Add {v.n} to a tier list" />
    {#if v.T.length}<div class="mini">{#each v.T as t}<div class="bar" style="justify-content:space-between;border:1px solid var(--line);border-radius:8px;padding:8px 10px"><span class="t">{t.name}</span><span class="bar">{#each t.rows as r, i}<button class="btn sm" style="border-color:{r.color}" data-act="tp-place" data-k={t.id} data-row={i}>{r.label}</button>{/each}</span></div>{/each}</div>{:else}<p class="hint">No tier lists yet.</p>{/if}<div class="bar" style="margin-top:10px"><button class="btn" data-act="tier-new-from-sel">New tier list with these</button></div>
{/if}
