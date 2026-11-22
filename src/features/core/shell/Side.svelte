<!--
    src/features/core/shell/Side.svelte
    ─────────────────────────────────────────────────────────────────
      The sidebar: pin it, the mode you're in, its text size; then the sections you haven't hidden, each folding: every
      mode, this mode's shelves and statuses, your lists (and what's hidden), saved views, quick actions; the private
      collection; the footer (SideStatus). Drawn when the older code asks (renderSide in core/shell.ts), with what
      sideView() there works out. Its edge is dragged to resize it, and it peeks out from the screen's edge or its
      button while it isn't pinned (both its own, as the listeners in core/events.ts were). The buttons go through
      their data-act (core/nav-handlers.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Icon from "../Icon.svelte";
    import type { Snippet } from "svelte";
    import { $ as one, closestTo, markDirty, meta } from "../core";
    import { peekSide } from "../navigation";
    import { type SideButton, sideView } from "../shell";
    import { shellNews } from "./shell-state.svelte";
    import SideStatus from "./SideStatus.svelte";

    const v = $derived.by(() => {
        void shellNews.side;
        return sideView();
    });

    // its edge, dragged: the width follows the pointer between 170 and 380 px, and is kept when you let go
    function grip(e: PointerEvent) {
        e.preventDefault();
        const side = one("#side")!,
            rect = side.getBoundingClientRect(),
            right = meta.layout.side.pos === "right";
        document.body.classList.add("resizing");
        const mv = (ev: PointerEvent) => {
            const w = Math.round(Math.max(170, Math.min(380, right ? rect.right - ev.clientX : ev.clientX - rect.left)));
            meta.layout.side.width = w;
            one("#app")!.style.setProperty("--side-w", w + "px");
        };
        const up = () => {
            removeEventListener("pointermove", mv);
            removeEventListener("pointerup", up);
            document.body.classList.remove("resizing");
            markDirty();
        };
        addEventListener("pointermove", mv);
        addEventListener("pointerup", up);
    }
    // peeking: from the screen's edge at once, from its button after a short hover; it hides a moment after you leave
    // it. One motion only (a transform), and a grace period so passing over the gap never makes it flicker
    const peek: { t: ReturnType<typeof setTimeout> | 0; leave: ReturnType<typeof setTimeout> | 0 } = { t: 0, leave: 0 };
    function moved(e: PointerEvent) {
        if (meta.layout.side.pinned || e.pointerType === "touch" || innerWidth < 861 || document.body.classList.contains("resizing"))
            return;
        const app = one("#app")!,
            right = meta.layout.side.pos === "right",
            w = meta.layout.side.width,
            edge = right ? e.clientX >= innerWidth - 8 : e.clientX <= 8,
            over = !!(closestTo(e, "#side") || closestTo(e, ".sidebtn")),
            inBand = right ? e.clientX >= innerWidth - w - 16 : e.clientX <= w + 16;
        if (!app.classList.contains("side-peek")) {
            if (edge) {
                clearTimeout(peek.t);
                peekSide(true);
            } else if (closestTo(e, ".sidebtn")) {
                if (!peek.t)
                    peek.t = setTimeout(() => {
                        peek.t = 0;
                        peekSide(true);
                    }, 140);
            } else {
                clearTimeout(peek.t);
                peek.t = 0;
            }
            return;
        }
        if (over || inBand) {
            clearTimeout(peek.leave);
            peek.leave = 0;
            return;
        }
        if (!peek.leave)
            peek.leave = setTimeout(() => {
                peek.leave = 0;
                if (!meta.layout.side.pinned) peekSide(false);
            }, 260);
    }
</script>

<svelte:document onpointermove={moved} />

{#snippet nb(b: SideButton)}<button class={b.cls} data-act={b.act} data-k={b.k}><span class="ic">{b.ic}</span><span class="nl">{b.label}</span>{#if b.ct != null}<span class="ct">{b.ct}</span>{/if}</button>{/snippet}
{#snippet sec(k: string, label: string, shut: boolean, body: Snippet)}<div class="sgroup{shut ? ' shut' : ''}"><button class="sl" data-act="side-sec" data-k={k}><span>{label}</span><span class="chev">▾</span></button><div class="sbody">{@render body()}</div></div>{/snippet}
{#snippet modes()}{#each v.modes?.list || [] as m (m.id)}<button class="nb{m.on ? ' on' : ''}" data-act="mode" data-k={m.id} style={m.mc}><span class="ic mgi">{m.g}</span><span class="nl">{m.name}</span><span class="ct">{m.n}</span></button>{/each}<div class="nsep" role="separator"></div>{#if v.modes?.stage}<button class="nb{v.modes.stage.on ? ' on' : ''}" data-act="go-stage"><span class="ic mgi">▶</span><span class="nl">Watch & read <span class="beta">beta</span></span></button>{/if}{/snippet}
{#snippet lib()}{#each v.lib?.rows || [] as b, i (i)}{@render nb(b)}{/each}{/snippet}
{#snippet lists()}{#each v.lists?.rows || [] as b, i (i)}{@render nb(b)}{/each}<button class="nb ghost" data-act="list-new"><span class="ic">+</span><span class="nl">New list</span></button>{#if v.lists?.hidden}{@render nb(v.lists.hidden)}{/if}{/snippet}
{#snippet views()}{#each v.views?.list || [] as x (x.id)}<button class="nb{x.on ? ' on' : ''}" data-act="go-view" data-k={x.id}><span class="ic">☆</span><span class="nl">{x.name}</span><span class="x" data-act="del-view" data-k={x.id} role="button" aria-label="Delete view">✕</span></button>{/each}{/snippet}
{#snippet quick()}<button class="nb" data-act="focus-search"><span class="ic">+</span><span class="nl">Add something</span><kbd>{v.quick?.add}</kbd></button><button class="nb" data-act="open-pick"><span class="ic">⚄</span><span class="nl">Pick for me</span><kbd>{v.quick?.pick}</kbd></button>
    {#if v.quick?.io}<button class="nb" data-act="go-settings" data-k="io"><span class="ic">⇅</span><span class="nl">Import or export</span></button>{/if}<button class="nb" data-act="go-features"><span class="ic">✦</span><span class="nl">Guide</span></button>{/snippet}
<div class="side-in"><div class="side-head"><button class="ib sidepin{v.pinned ? ' on' : ''}" data-act="side-pin" title={v.pinTitle} aria-pressed={v.pinned}><Icon name="side" /></button><span class="sh-mode">{v.modeName}</span><span class="stext" role="group" aria-label="Sidebar text size">{#each v.text as t (t.k)}<button class="st-{t.k}{t.on ? ' on' : ''}" data-act="side-text" data-k={t.k} title="{t.n} text" aria-pressed={t.on}>A</button>{/each}</span></div>{" "}{#if v.modes}{@render sec("modes", "Modes", v.modes.shut, modes)}{" "}{/if}{#if v.lib}{@render sec("lib", v.lib.name, v.lib.shut, lib)}{" "}{/if}{#if v.lists}{@render sec("lists", "Lists", v.lists.shut, lists)}{/if}{#if v.views}{@render sec("views", "Saved views", v.views.shut, views)}{/if}{#if v.quick}{@render sec("do", "Quick", v.quick.shut, quick)}{/if}{#if v.priv}<div class="sdiv"></div><button class="nb" data-act="private-toggle"><span class="ic">{v.priv.on ? "↩" : "🔒"}</span><span class="nl">{v.priv.on ? "Leave private" : "Private collection"}</span></button>{/if}<span class="sfill"></span><div class="sfoot2" id="sidestatus"><SideStatus /></div></div><!-- svelte-ignore a11y_no_static_element_interactions --><div class="side-grip" title="Drag to resize" onpointerdown={grip}></div>
