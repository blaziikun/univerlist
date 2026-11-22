<!--
    src/features/watch-read/reader/Reader.svelte
    ─────────────────────────────────────────────────────────────────
      The reader (#reader, over everything): the top bar (close, the title, auto-scroll, zoom, where you are, the
      chapter or page to log for a book, full screen, settings), the page (pictures page by page, one long strip, a
      book's chapter in a sandboxed frame, or a PDF), a book's chapter buttons, the progress bar and the settings
      (ReaderOpts). Mounted on <body> while something is open (watch-read/surfaces.ts). It draws when the older code
      asks (renderReader in read.ts): a page turned draws the new page, not the strip. Kept as plain code on purpose:
      which page of a long strip you're on as you scroll (rdTrack, a rAF a frame at most), auto-scroll (a rAF loop), and
      pages arriving (rdPageIn); only the words and the bar that say where you are follow them (stageNews.rdlive). Its
      own: the keys (readerKey), the controls fading when the mouse is still, holding the mouse to pause auto-scroll.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { onDestroy, untrack } from "svelte";
    import { stageNews } from "../stage-state.svelte";
    import {
        RD,
        rdPageIn,
        rdTrack,
        readDone,
        readerAtView,
        readerAuto,
        readerClose,
        readerFull,
        readerHold,
        readerKey,
        readerLog,
        readerOptsToggle,
        readerSeek,
        readerView,
        readerZoom,
        readStart,
        readStep,
    } from "../read";
    import ReaderOpts from "./ReaderOpts.svelte";

    const v = $derived.by(() => {
        void stageNews.reader;
        return readerView();
    });
    // where you are, which moves as you scroll a long strip
    const at = $derived.by(() => {
        void stageNews.reader;
        void stageNews.rdlive;
        return readerAtView();
    });
    const strip = $derived(!!v && v.kind === "images" && v.mode === "scroll");

    // the controls fade when the mouse is still (not while the settings are open)
    let idle = $state(false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    function wake() {
        idle = false;
        clearTimeout(timer);
        timer = setTimeout(() => {
            if (!RD.opts) idle = true;
        }, 2600);
    }
    $effect(() => {
        void stageNews.reader;
        untrack(wake);
    });
    onDestroy(() => clearTimeout(timer));

    function key(e: KeyboardEvent) {
        if (!readerKey(e)) return;
        e.preventDefault();
        e.stopPropagation();
    }
</script>

<svelte:document onkeydowncapture={key} onpointerup={() => readerHold(false)} />
{#if v}<!-- svelte-ignore a11y_no_static_element_interactions: the mouse moving anywhere over it shows the controls --><div id="reader" data-svelte="" class={v.cls} class:idle style:--rdbg={v.bg} style:--rdbright={v.bright} style:--rdar={at.ar || undefined} onpointermove={wake}><div class="cin-top"><button class="x" data-act="rd-close" aria-label="Close (Esc)" title="Close (Esc)" onclick={readerClose}>✕</button><b>{v.title}</b><span class="spacer"></span>{" "}{#if strip}<button class="btn sm ghost" data-act="rd-auto" aria-pressed={at.auto} title="Auto-scroll (A)" onclick={readerAuto}>{at.auto ? "❚❚ Auto-scroll" : "▶ Auto-scroll"}</button>{" "}{/if}{#if v.kind === "images"}<button class="btn sm ghost" data-act="rd-zoom" data-k="-1" title="Zoom out (−)" aria-label="Zoom out" onclick={() => readerZoom(-1)}>−</button><span class="hint rdz">{v.o.zoom}%</span><button class="btn sm ghost" data-act="rd-zoom" data-k="1" title="Zoom in (+)" aria-label="Zoom in" onclick={() => readerZoom(1)}>+</button>{" "}{/if}<span class="hint rdat">{at.word}</span>{" "}{#if v.log}<label class="ctl">{v.log.unit + " "}<input class="inp" id="rd-log" inputmode="numeric" style="width:70px" value={v.log.prog} onchange={e => readerLog(e.currentTarget.value)}></label>{" "}{/if}<button class="cb" data-act="rd-full" title="Full screen (F)" aria-label="Full screen" onclick={readerFull}>⛶</button><button class="cb" data-act="rd-opts" aria-pressed={v.opts} title="Reader settings" aria-label="Reader settings" onclick={readerOptsToggle}>⚙</button></div>{" "}<!-- svelte-ignore a11y_no_static_element_interactions: holding the mouse down on the page pauses auto-scroll --><div class="cin-stage rdstage" onpointerdown={() => RD.auto && readerHold(true)} {@attach strip ? rdTrack : undefined}>{#if v.kind === "pdf"}<iframe class="rdpdf" src={v.pages[0]} title="PDF"></iframe>{:else if v.kind === "epub"}<iframe class="rdepub" sandbox="allow-same-origin" srcdoc={v.doc} title="Chapter"></iframe>{:else if v.mode === "scroll"}<div class="rdscroll" style="--rdw:{Math.round((v.o.width * v.o.zoom) / 100)}px;--rdgap:{v.o.gap}px">{#each v.pages as u, i (i)}<img src={u} alt="Page {i + 1}" loading={Math.abs(i - v.idx) < 3 ? "eager" : "lazy"} data-pg={i} onload={e => rdPageIn(e.currentTarget)}>{/each}<div class="rdend"><button class="btn gold" data-act="rd-done" onclick={readDone}>{v.finished}</button>{#if v.nextFile}<button class="btn" data-act="rd-nextfile" onclick={() => readStart(RD.fi + 1)}>Next file →</button>{/if}</div></div>{:else}<div class="rdpage{v.rtl ? ' rtl' : ''}{v.two ? ' two' : ''}{v.tap ? ' tapnext' : ''}" style="--rdz:{v.o.zoom / 100}">{#if v.tap}<button class="rdhalf all" data-act="rd-next" aria-label="Next page" onclick={() => readStep(1)}></button>{:else if v.rtl}<button class="rdhalf l" data-act="rd-next" aria-label="Next page" onclick={() => readStep(1)}></button>{:else}<button class="rdhalf l" data-act="rd-prev" aria-label="Previous page" onclick={() => readStep(-1)}></button>{/if}<div class="rdimgs">{#each v.shown as i (i)}<img src={v.pages[i]} alt="Page {i + 1}" class="fit-{v.fit}" draggable="false">{/each}</div>{#if !v.tap}{#if v.rtl}<button class="rdhalf r" data-act="rd-prev" aria-label="Previous page" onclick={() => readStep(-1)}></button>{:else}<button class="rdhalf r" data-act="rd-next" aria-label="Next page" onclick={() => readStep(1)}></button>{/if}{/if}</div>{/if}</div>{" "}{#if v.kind === "epub"}<div class="cin-bot"><button class="btn sm ghost" data-act="rd-prev" disabled={!v.ci} onclick={() => readStep(-1)}>← Chapter</button><span class="spacer"></span><button class="btn sm ghost" data-act="rd-next" onclick={() => readStep(1)}>{v.ci < v.n - 1 ? "Chapter →" : "Finish"}</button></div>{" "}{/if}{#if v.o.showBar && v.kind !== "pdf"}<!-- svelte-ignore a11y_click_events_have_key_events: ← → and Home / End move through it from anywhere in the reader --><div class="rdbar{v.rtl && v.mode === 'paged' ? ' rtl' : ''}" role="slider" aria-label="Where you are" aria-valuemin="1" aria-valuemax={v.n} aria-valuenow={v.at + 1} tabindex="0" data-act="rd-seek" onclick={e => readerSeek(e, e.currentTarget)}><span style="width:{at.bar}"></span></div>{" "}{/if}{#if v.opts}<ReaderOpts />{/if}</div>{/if}
