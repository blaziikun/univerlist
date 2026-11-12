<!--
    src/features/core/menus/EpisodeMenu.svelte
    ─────────────────────────────────────────────────────────────────
      One episode's own source (Watch's "Add source" or ⋯ on an episode, the player's "Paste a link"): a link to a video
      file, or a file you choose, for just this one. k is "<season's place>:<episode>". Save link uses what's typed, so
      it's this one's own (and the link must be one of your own sources, watch-read/own-sources.ts); removing the link
      and choosing a file are "ws-unlink" and "ws-file" (watch-read/handlers.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../store.svelte";
    import { fieldsOf, toast } from "../core";
    import { closeCtx } from "../keys";
    import { isOwnSource, NOT_OWN_SOURCE } from "../../watch-read/own-sources";
    import { seasonItem, srcKey, watchSetSource } from "../../watch-read/watch";

    let { k }: { k: string } = $props();

    const si = $derived(Number(k.split(":")[0])),
        ep = $derived(Number(k.split(":")[1]));
    const saved = $derived.by(() => {
        void store.items;
        const b = seasonItem(si),
            cur = b ? fieldsOf(fieldsOf(b.sources)[srcKey(si, ep)]) : null;
        return cur ? String(cur.url ?? "") : "";
    });
    let url = $state("");
    $effect.pre(() => {
        url = saved;
    });
    function save() {
        const u = url.trim();
        if (!/^https?:\/\//.test(u)) {
            toast("Paste a link that starts with http");
            return;
        }
        if (!isOwnSource(u)) {
            toast(NOT_OWN_SOURCE);
            return;
        }
        watchSetSource(si, ep, { url: u });
        closeCtx();
    }
</script>

<div class="ctx-h"><b>Episode {ep}</b><small>Just for this one</small></div>
<div class="ctx-s"><span class="ilab">Link to a video file</span><input class="inp" id="ws-url" bind:value={url} placeholder="https://…/episode.mp4"><div class="ctx-a"><button data-act="ws-url" data-s={si} data-k={ep} onclick={save}>Save link</button>{#if saved}<button data-act="ws-unlink" data-s={si} data-k={ep}>Remove link</button>{/if}</div></div>
<div class="ctx-a"><button data-act="ws-file" data-s={si} data-k={ep}>Choose a file…</button></div>
