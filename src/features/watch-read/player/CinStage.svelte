<!--
    src/features/watch-read/player/CinStage.svelte
    ─────────────────────────────────────────────────────────────────
      The stage: the <video> (or a YouTube video, or "nothing to play yet" with the ways to add it), and what's drawn
      over it while it plays (its Overlay): the subtitles (subtitles.ts writes them), the back and forward jumps (big
      buttons on a phone, small and faint on a computer, where a double click on either side jumps too), how much of a
      stream has arrived, waiting so it won't stop, Resumed at…, Skip intro while an opening plays, Up next, and none
      of the servers could play it. Cinema.svelte draws a new one for each new video (renderPlayer), so it starts clean.
      Everything the video does as it plays is video.ts (an attachment); presses on the picture are tapZones in
      player.ts. The buttons go through their data-act (handlers.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { onDestroy, untrack } from "svelte";
    import Icon from "../../core/Icon.svelte";
    import { stageNews } from "../stage-state.svelte";
    import { pcPart, tapZones } from "../player";
    import { PS } from "../watch";
    import { Overlay, overlayNow, overlayUse } from "./overlay.svelte";
    import { videoRig } from "./video";
    import { emptyView, type PlayerView } from "./view";

    let {
        v,
        wake,
        sleep,
        shown,
    }: { v: PlayerView; wake: () => void; sleep: () => void; shown: () => boolean } = $props();

    // this video's overlay, and the code that runs it: set up once, when it's drawn
    const ov = new Overlay();
    overlayUse(ov);
    onDestroy(() => {
        if (overlayNow() === ov) overlayUse(null);
    });
    const rig = untrack(() =>
        videoRig({ p: v.p, src: v.src, url: v.url, hls: v.hls, o: v.o, hasNext: v.hasNext, ov, wake })
    );
    const taps = untrack(() => tapZones({ wake, sleep, shown }));
    const empty = $derived(v.url ? null : emptyView(v.p));
    // the picture's fit, and how far the jumps go, which follow the settings at once
    const o = $derived.by(() => {
        void stageNews.look;
        return PS();
    });
    const stopsHint = (wait: string, alt: { k: number } | null) =>
        `Wait ${wait} and it plays to the end without stopping${alt ? `, or try Server ${alt.k + 1}` : ""}.`;
</script>

<div class="cin-stage" {@attach taps}>{#if empty}<div class="cin-empty"><div class="ce-in">{#if empty.loading}<p class="think">Loading…</p>{:else}<p class="hint">{empty.note}</p>{#if empty.looking}<p class="think">Still checking your servers…</p>{/if}{" "}<div class="ce-a"><button class="btn sm gold" data-act="ws-file" data-s={empty.s} data-k={empty.k}>Upload the file…</button>{#if !empty.film}<button class="btn sm" data-act="watch-files">A folder of episodes…</button>{/if}<button class="btn sm ghost" data-act="watch-src" data-s={empty.s} data-k={empty.k}>Paste a link</button><button class="btn sm" data-act="ss-open">{empty.servers}</button><button class="btn sm ghost" data-act="cin-servers">Your servers</button></div>{/if}</div></div>{:else if v.f.yt}<iframe src="https://www.youtube-nocookie.com/embed/{v.f.yt}?autoplay=1" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="YouTube"></iframe>{:else}<!-- svelte-ignore a11y_media_has_caption: subtitles are added as they're found or loaded, and drawn by the player (subtitles.ts) --><video src={v.hls ? undefined : v.url} autoplay={v.f.autoplay} playsinline style="object-fit:{o.fit}" {@attach rig}></video><div class="pc-subtext" hidden aria-live="off"></div><div class="pc-mid"><button class="cb pc-jump back" data-act="cin-back" title="Back {o.seek} s (←)" aria-label="Back {o.seek} seconds (←)"><Icon name="replay" /><span class="n">{o.seek}</span></button><button class="cb pc-bigplay" data-act="pc-play" aria-label="Play (space)" {@attach pcPart("bigplay")}><span class="i-play"><Icon name="playBig" /></span><span class="i-pause"><Icon name="pause" /></span></button><button class="cb pc-jump fwd" data-act="cin-fwd" title="Forward {o.seek} s (→)" aria-label="Forward {o.seek} seconds (→)"><Icon name="forward" /><span class="n">{o.seek}</span></button></div><span class="pc-flash back" aria-hidden="true"><Icon name="replay" /><span class="n">{o.seek}</span></span><span class="pc-flash fwd" aria-hidden="true"><Icon name="forward" /><span class="n">{o.seek}</span></span>{/if}{#if ov.net}<div class="cin-net" hidden={ov.net.hidden} aria-live="polite">{ov.net.text}</div>{/if}{#if ov.hold}<div class="cin-hold" hidden={ov.hold.hidden}>{#if ov.hold.card?.t === "start"}<p><b>Getting it started…</b></p><p class="hint">Working out how long to wait so it won't stop.</p><button class="btn sm" data-act="cin-startnow">Start now</button>{:else if ov.hold.card?.t === "wait"}<p><b>{"Starts in " + ov.hold.card.wait}</b></p><p class="hint">Then it plays to the end without stopping.</p><button class="btn sm" data-act="cin-startnow">Start now</button>{:else if ov.hold.card?.t === "stops"}<p><b>Keeps stopping?</b></p><p class="hint">{stopsHint(ov.hold.card.wait, ov.hold.card.alt)}</p><div class="bar"><button class="btn sm gold" data-act="cin-hold">Wait</button>{#if ov.hold.card.alt}<button class="btn sm" data-act="cin-src-pick" data-k={ov.hold.card.alt.k} title={ov.hold.card.alt.title}>Try Server {ov.hold.card.alt.k + 1}</button>{/if}<button class="btn sm ghost" data-act="cin-holdno">Keep going</button></div>{/if}</div>{/if}{#if ov.chip}<div class="pc-chip" role="status">{ov.chip}<button class="linkbtn" data-act="pc-startover">Start over</button></div>{/if}{#if ov.skip && !ov.next}<button class="pc-skipintro" data-act="cin-skip" title="Skip intro (S)">Skip intro</button>{/if}{#if ov.next}<div class="pc-next" role="dialog" aria-label="Up next"><p class="hint">Up next</p><p><b>{ov.next.label}</b></p><p class="pc-cd">{"in " + ov.next.n + "…"}</p><div class="bar"><button class="btn sm gold" data-act="pc-next-now">Play now</button><button class="btn sm ghost" data-act="pc-next-cancel">Cancel</button></div></div>{/if}{#if ov.err}<p class="cin-err">None of the servers could play this here. Links need to point straight at a video, or an adaptive stream; some formats (like MKV with certain codecs) only play through a server that converts them, such as Jellyfin or Plex.</p>{/if}</div>
