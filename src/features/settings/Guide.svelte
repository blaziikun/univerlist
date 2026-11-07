<!--
    src/features/settings/Guide.svelte
    ─────────────────────────────────────────────────────────────────
      "What's in here": the guide, one document with its contents down the side (and a Markdown download). The text and
      how it's turned into HTML live in guide.js (GUIDE_MD, mdRender), as do the start list's ticks, which it remembers.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    // drawn once when the page opens: ticking the start list updates itself (guide.js), so nothing needs redrawing
    const toc = [...GUIDE_MD.matchAll(/^## (.*)$/gm)].map(m => m[1]);
    const body = mdRender(GUIDE_MD);
</script>

<div class="guide">
    <nav class="gtoc" aria-label="Contents">
        <p class="label">Contents</p>
        {#each toc as t (t)}<a href={`#g-${slug(t)}`}>{t}</a>{/each}
        <div class="bar"><button class="btn sm ghost" data-act="guide-md">Download as Markdown</button></div>
    </nav>
    <!-- the guide's own text, written in this app (guide.js): links in it are only the app's own actions -->
    <article class="mdoc">{@html body}</article>
</div>
