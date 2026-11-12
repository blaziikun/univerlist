<!--
    src/features/watch-read/player/PlayerOpts.svelte
    ─────────────────────────────────────────────────────────────────
      The player's settings (⚙): playing on, resuming, hiding the controls, how far Skip intro and the jumps go, the
      picture's fit, subtitles (size and language), what to do when a stream is slow, the badge, and whose controls.
      Each box saves as you change it (playerSet in watch.ts); the picture and the subtitles' size show at once, the rest
      the next time the player draws, as before. The keys are listed at the foot.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { playerSet, type PlayerPrefs } from "../watch";
    import { SUB_CHOICES } from "./view";

    let { o }: { o: PlayerPrefs } = $props();

    const FITS: [string, string][] = [
        ["contain", "Fit"],
        ["cover", "Fill the screen"],
        ["fill", "Stretch"],
    ];
    const STARTS: [string, string][] = [
        ["now", "Start at once (offer to wait if it stops)"],
        ["smooth", "Wait until it won't stop, then start"],
    ];
    const CONTROLS: [string, string][] = [
        ["custom", "UniverList's (buttons on the video, seeks everything)"],
        ["browser", "The browser's own"],
    ];
    // a number box: never below 0, and 0 when it isn't a number
    const num = (x: string) => Math.max(0, parseFloat(x) || 0);
</script>

{#snippet sel(k: string, opts: [string, string][], val: string)}<select class="sel" data-po={k} value={val} onchange={e => playerSet(k, e.currentTarget.value)}>{#each opts as [x, l] (x)}<option value={x}>{l}</option>{/each}</select>{/snippet}
{#snippet tick(k: "autoNext" | "resume" | "hideUI" | "netBadge", l: string, on: boolean)}<label class="ctl"><input type="checkbox" data-po={k} checked={on} onchange={e => playerSet(k, e.currentTarget.checked)}>{" " + l}</label>{/snippet}
<div class="cin-opts panel">{" "}{@render tick("autoNext", "Play the next episode automatically", o.autoNext)}{" "}{@render tick("resume", "Resume where I stopped", o.resume)}{" "}{@render tick("hideUI", "Hide the controls when I'm not moving the mouse", o.hideUI)}{" "}<label class="ctl">Skip intro by <input class="inp" data-pon="skip" value={o.skip} style="width:56px" onchange={e => playerSet("skip", num(e.currentTarget.value))}> seconds (0 hides it)</label>{" "}<label class="ctl">Jump by <input class="inp" data-pon="seek" value={o.seek} style="width:56px" onchange={e => playerSet("seek", num(e.currentTarget.value))}> seconds</label>{" "}<label class="ctl">Picture {@render sel("fit", FITS, o.fit)}</label>{" "}<label class="ctl">Subtitle size <input type="range" min="60" max="200" step="10" data-pon="subSize" value={o.subSize} onchange={e => playerSet("subSize", num(e.currentTarget.value))}></label>{" "}<label class="ctl">Subtitles {@render sel("subLang", SUB_CHOICES, o.subLang)}</label>{" "}<label class="ctl">When a stream is slow {@render sel("startMode", STARTS, o.startMode)}</label>{" "}{@render tick("netBadge", "Show how much has arrived", o.netBadge !== false)}{" "}<label class="ctl">Controls {@render sel("controls", CONTROLS, o.controls === "browser" ? "browser" : "custom")}</label>{" "}<div class="bar"><button class="btn sm" data-act="wp-edit">Edit the player on the page…</button><button class="btn sm ghost" data-act="open-settings">All settings…</button></div>{" "}<p class="hint">Keys: space play/pause · ← → jump · ↑ ↓ volume · F full screen · M mute · N next · S skip intro · C subtitles · Esc close</p></div>
