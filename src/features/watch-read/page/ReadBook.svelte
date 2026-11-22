<!--
    src/features/watch-read/page/ReadBook.svelte
    ─────────────────────────────────────────────────────────────────
      The Read page with a book or series open: its cover, name and how far you are; opening its files (read-files),
      its card, and back; the files you opened this time, each to read (read-start); what your servers have
      (ReadServerList). The reader itself opens over it (#reader, reader/Reader.svelte). readBookView() in read.ts.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Pic from "../../core/dialog/Pic.svelte";
    import { stageNews } from "../stage-state.svelte";
    import { readBookView } from "../read";
    import ReadServerList from "./ReadServerList.svelte";
    import ReadServers from "./ReadServers.svelte";
    import StageHead from "./StageHead.svelte";

    let { servers }: { servers: boolean } = $props();

    const v = $derived.by(() => {
        void stageNews.page;
        return readBookView();
    });
</script>

{#if v}<div class="watch read">{" "}<StageHead kind="read" />{" "}{#if servers}<ReadServers />{" "}{/if}<section class="wshow"><div class="wshade"></div><div class="wsh">{#if v.cover}<Pic class="wposter" src={v.cover} referrerpolicy={undefined} />{/if}<div><p class="eyebrow">{v.eyebrow}</p><h2>{v.title}</h2><p class="hint">{v.prog}</p>{" "}<div class="bar"><button class="btn sm gold" data-act="read-files">{v.open}</button><button class="btn sm ghost" data-act="open" data-id={v.id}>Open card</button><button class="btn sm ghost" data-act="read-home">← Back</button></div></div></div></section>{" "}{#if v.files.length}<section class="wrow"><h3>Opened this time</h3><div class="weps">{#each v.files as f (f.i)}<div class="wep"><span class="wnum">{f.n}</span><div class="wet"><b>{f.name}</b><small>{f.sub}</small></div><div class="wea"><button class="btn sm gold" data-act="read-start" data-k={f.i}>Read</button></div></div>{/each}</div></section>{/if}<ReadServerList it={v.it} />{" "}<p class="hint wnote">Nothing is uploaded or copied: files you open stay on your computer, and chapters on your servers are read straight from them. Finishing a chapter logs it to the card.</p></div>{/if}
