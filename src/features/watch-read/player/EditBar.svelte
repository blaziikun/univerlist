<!--
    src/features/watch-read/player/EditBar.svelte
    ─────────────────────────────────────────────────────────────────
      "Edit the player": the look's sliders (the player's size, the side panel, corners, controls, the shade behind
      them, how soon they hide, where subtitles sit and their background), which the player follows as you drag
      (lookSet in player.ts), and Hidden: the buttons you've taken off, a place to drop more. Dragging is Cinema.svelte's;
      Reset look and Done go through their data-act (stageClick in stage.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { stageNews } from "../stage-state.svelte";
    import { lookSet, type Look } from "../player";
    import { editView } from "./view";

    let { drag }: { drag: { k: string | null; zone: string | null } } = $props();

    const v = $derived.by(() => {
        void stageNews.player;
        return editView();
    });
    // each slider's value as you drag it, shown beside it
    let look = $state<Look>(editView().look);
    $effect.pre(() => {
        look = v.look;
    });
    const RANGES: [k: keyof Look, label: string, min: number, max: number, step: number, unit: string][] = [
        ["size", "Player size", 50, 100, 1, "%"],
        ["side", "Side panel", 240, 560, 10, " px"],
        ["radius", "Corners", 0, 32, 1, " px"],
        ["ctl", "Controls size", 70, 160, 5, "%"],
        ["dim", "Shade behind controls", 0, 100, 5, "%"],
        ["hideAfter", "Hide controls after", 1, 10, 0.5, " s"],
        ["subPos", "Raise subtitles", 0, 10, 1, " lines"],
        ["subBg", "Subtitle background", 0, 100, 5, "%"],
    ];
    function slid(k: keyof Look, x: number) {
        look = { ...look, [k]: x };
        lookSet(k, x);
    }
</script>

<div class="we-bar" role="dialog" aria-label="Edit the player"><div class="we-h"><b>Edit the player</b><span class="hint">Drag buttons onto the video, under it, or into Hidden.</span><span class="spacer"></span><button class="btn sm ghost" data-act="wp-look-reset">Reset look</button><button class="btn sm gold" data-act="wp-edit">Done</button></div>{" "}<div class="we-grid">{#each RANGES as [k, l, a, b, st, unit] (k)}<label class="we-r">{l}<input type="range" min={a} max={b} step={st} data-look={k} value={look[k]} oninput={e => slid(k, +e.currentTarget.value)}><output>{look[k] + unit}</output></label>{/each}</div>{" "}<div class="we-hidden wz{drag.zone === 'off' ? ' over' : ''}" data-zone="off"><span class="hint">Hidden:</span>{#each v.hidden as t (t.k)}<span class="wt{drag.k === t.k ? ' dragging' : ''}" draggable="true" data-tool={t.k}><span class="cb wtname">{t.name}</span></span>{:else}<span class="hint">nothing</span>{/each}</div></div>
