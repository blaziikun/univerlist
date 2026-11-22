<!--
    src/features/watch-read/player/SubsPanel.svelte
    ─────────────────────────────────────────────────────────────────
      Subtitles (CC on the controls): which track shows (off, the ones that came with this episode, a file you loaded,
      or load one), and how they look: their size, how high they sit, how dark the box behind them is (the player draws
      them itself, subtitles.ts, so these work for every kind of track and in every browser), and your language, picked
      by itself when an episode comes with it. Each saves as you change it and shows at once. It closes on a click
      anywhere else (Cinema.svelte).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { playingVideo } from "./pip";
    import type { WatchPlayer } from "../../core/model";
    import { stageChanged, stageNews } from "../stage-state.svelte";
    import { playerSet, PS, subPicked } from "../watch";
    import { subAllOff, subOn, subToggle } from "./subtitles";
    import { ccView, SUB_CHOICES } from "./view";

    let { p }: { p: WatchPlayer } = $props();

    const s = $derived.by(() => {
        void stageNews.subs;
        void stageNews.player;
        return ccView(p);
    });
    const o = $derived.by(() => {
        void stageNews.look;
        void stageNews.player;
        return PS();
    });
    const vid = () => playingVideo();
    // the file's track shows (a track you loaded, not one of the episode's own)
    const fileOn = $derived.by(() => {
        void stageNews.subs;
        return s.file && !s.cur && subOn(vid());
    });
    function off() {
        subPicked("");
        const v = vid();
        if (v) subAllOff(v);
        stageChanged("subs");
    }
    function file() {
        subPicked("");
        const v = vid();
        if (v && !subOn(v)) subToggle(v);
        stageChanged("subs");
    }
    function pick(url: string) {
        subPicked(url);
        stageChanged("subs");
    }
    // each slider's value as you drag it, kept when you let go
    let size = $state(PS().subSize);
    let pos = $state(PS().subPos);
    let bg = $state(PS().subBg);
</script>

<div class="cin-pop cin-cc" role="dialog" aria-label="Subtitles"><p class="ilab">Subtitles</p><div class="cc-tracks" role="group" aria-label="Which subtitles"><button class="srcrow" aria-pressed={!s.cur && !fileOn} onclick={off}><span class="dot"></span><span class="sn"><b>Off</b></span></button>{#each s.list as t (t.url)}<button class="srcrow" aria-pressed={s.cur === t.url} onclick={() => pick(t.url)}><span class="dot"></span><span class="sn"><b>{t.label || "Subtitles"}</b>{#if t.lang}<small>{t.lang}</small>{/if}</span></button>{/each}{#if s.file}<button class="srcrow" aria-pressed={fileOn} onclick={file}><span class="dot"></span><span class="sn"><b>Your file</b></span></button>{/if}<button class="linkbtn" data-act="cin-subs">Load subtitles from a file (.srt or .vtt)…</button></div><label class="ctl rng">Size <input type="range" min="60" max="200" step="10" data-pon="subSize" value={size} oninput={e => { size = +e.currentTarget.value; playerSet("subSize", size); }}><output>{size}%</output></label><label class="ctl rng">Height <input type="range" min="0" max="10" step="1" data-pon="subPos" value={pos} oninput={e => { pos = +e.currentTarget.value; playerSet("subPos", pos); }}><output>{pos ? "+" + pos : "Low"}</output></label><label class="ctl rng">Background <input type="range" min="0" max="100" step="5" data-pon="subBg" value={bg} oninput={e => { bg = +e.currentTarget.value; playerSet("subBg", bg); }}><output>{bg}%</output></label><label class="ctl">Language <select class="sel" data-po="subLang" value={o.subLang} onchange={e => playerSet("subLang", e.currentTarget.value)}>{#each SUB_CHOICES as [x, l] (x)}<option value={x}>{l}</option>{/each}</select></label></div>
