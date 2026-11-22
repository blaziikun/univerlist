<!--
    src/features/library/page/FilterRules.svelte
    ─────────────────────────────────────────────────────────────────
      The advanced filter's rules: a field, a test and a value each ("Crowd score at least 80"), all of them or any.
      What each field reads and how it's tested is core/types.ts's (RULE_FIELDS, RULE_OPS, rulesOk). The boxes are
      handled here; + Rule, ✕ and all/any go through their data-act names (library/handlers.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { ui } from "../../core/core";
    import { renderMain } from "../../core/shell";
    import { RULE_FIELDS, RULE_OPS, ruleValues } from "../../core/types";
    import { FILT_EMPTY } from "../library";
    import type { Filter, Rule } from "../../core/model";

    let { f }: { f: Filter } = $props();

    const fields = RULE_FIELDS.map((x): [string, string] => [x[0], x[1]]);

    /** one part of rule i changed: a new field starts its test and value afresh */
    function set(i: number, k: "f" | "op" | "v", v: string) {
        const filt = (ui.filt = { ...FILT_EMPTY(), ...(ui.filt || {}) }),
            R: Rule[] = (filt.rules = (filt.rules || []).slice());
        R[i] = { ...R[i], [k]: v };
        if (k === "f") {
            const F = RULE_FIELDS.find(x => x[0] === v);
            if (F) R[i].op = RULE_OPS[F[2]][0][0];
            R[i].v = "";
        }
        ui.viewId = null;
        renderMain();
    }
</script>

{#snippet sel(i: number, k: "f" | "op", opts: [string, string][], val: unknown)}
    <select class="sel" data-rule={i} data-rk={k} onchange={e => set(i, k, e.currentTarget.value)}>{#each opts as [o, l]}<option value={o} selected={String(val) === String(o)}>{l}</option>{/each}</select>
{/snippet}

<div class="rules"><div class="fp-head"><b>Rules</b><span class="hint">match</span><div class="seg">{#each [["", "all"], ["1", "any"]] as [k, l]}<button data-act="rule-any" data-k={k} aria-pressed={!!k === !!f.any}>{l}</button>{/each}</div><span class="spacer"></span><button class="btn sm" data-act="rule-add">+ Rule</button></div>
    {#each f.rules as r, i}{@const F = RULE_FIELDS.find(x => x[0] === r.f) || RULE_FIELDS[0]}{@const type = F[2]}{@const vals = ruleValues(F[0])}<div class="rule">{@render sel(i, "f", fields, F[0])}{@render sel(i, "op", RULE_OPS[type], r.op || RULE_OPS[type][0][0])}
        {#if type !== "bool"}<input class="inp" data-rule={i} data-rk="v" value={r.v || ""} inputmode={type === "num" ? "decimal" : undefined} type={type === "date" ? "date" : undefined} list={vals.length ? `rv-${i}` : undefined} placeholder={type === "num" ? "number" : "value"} onchange={e => set(i, "v", e.currentTarget.value)}>{#if vals.length}<datalist id="rv-{i}">{#each vals as v}<option value={String(v)}></option>{/each}</datalist>{/if}{/if}
        <button class="linkbtn" data-act="rule-del" data-k={i} aria-label="Remove rule">✕</button></div>{:else}<p class="hint">Rules for anything the chips above can't say: “Crowd score at least 80”, “Finished after 2025-01-01”, “Theme has Time Travel”, “Notes contain rewatch”.</p>{/each}</div>
