<!--
    src/features/library/frame/AdjustPicture.svelte
    ─────────────────────────────────────────────────────────────────
      Adjust a picture (a profile picture, banner, cover, character or favourite picture): the picture in its frame's
      shape, dragged to move it and scrolled or slid to zoom, always covering the frame; Centre puts it back. Where it
      is (z, x, y) is the dialog's state, so frame.ts saves exactly what's shown: Save draws the framed part at full
      quality (frame-save), Cancel goes back to the dialog it was opened from (frame-cancel).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { onMount } from "svelte";
    import { store } from "../../core/store.svelte";
    import { coverCache, ui } from "../../core/core";
    import DialogHead from "../../core/dialog/DialogHead.svelte";

    const m = $derived.by(() => {
        const x = store.ui.modal;
        return x && x.kind === "frame" ? { ...x } : null;
    });
    // the frame's size and the picture's own, as they are once it has loaded
    let vw = $state(0),
        vh = $state(0),
        nat = $state({ w: 0, h: 0 }),
        img = $state<HTMLImageElement>(),
        view = $state<HTMLElement>();
    const loaded = () => {
        if (img && img.naturalWidth) nat = { w: img.naturalWidth, h: img.naturalHeight };
    };
    // the picture covers the frame: its base scale, then the offsets kept inside it
    const g = $derived.by(() => {
        if (!m || !nat.w || !vw) return null;
        const base = Math.max(vw / nat.w, vh / nat.h),
            s = base * (m.z || 1),
            w = nat.w * s,
            h = nat.h * s,
            x = Math.max(-(w - vw) / 2, Math.min((w - vw) / 2, m.x || 0)),
            y = Math.max(-(h - vh) / 2, Math.min((h - vh) / 2, m.y || 0));
        return { w, h, x, y, left: vw / 2 + x - w / 2, top: vh / 2 + y - h / 2 };
    });
    $effect(() => {
        // what's kept is what's shown (frame.ts saves from these)
        const live = ui.modal;
        if (g && live && live.kind === "frame") Object.assign(live, { x: g.x, y: g.y });
    });

    let drag: { x: number; y: number; ox: number; oy: number } | null = null;
    function down(e: PointerEvent) {
        if (!m) return;
        drag = { x: e.clientX, y: e.clientY, ox: m.x || 0, oy: m.y || 0 };
        view?.setPointerCapture?.(e.pointerId);
        e.preventDefault();
    }
    function move(e: PointerEvent) {
        if (!drag) return;
        store.dialog({ x: drag.ox + e.clientX - drag.x, y: drag.oy + e.clientY - drag.y });
    }
    onMount(() => {
        loaded();
        // scrolling zooms rather than scrolls the page, so this listener can't be passive
        const wheel = (e: WheelEvent) => {
            e.preventDefault();
            const z = ui.modal?.z || 1;
            store.dialog({ z: Math.max(1, Math.min(5, z * (e.deltaY < 0 ? 1.06 : 1 / 1.06))) });
        };
        view?.addEventListener("wheel", wheel, { passive: false });
        return () => view?.removeEventListener("wheel", wheel);
    });
</script>

<svelte:window onpointermove={move} onpointerup={() => (drag = null)} />
{#if m}<DialogHead title="Adjust: {m.name}" />
    <!-- svelte-ignore a11y_no_static_element_interactions: the picture is moved with the pointer; Centre and the zoom slider do it without one -->
    <div class="fwrap"><div class="fview" id="fview" style="aspect-ratio:{m.ar}" bind:this={view} bind:clientWidth={vw} bind:clientHeight={vh} onpointerdown={down}><img id="fimg" src={coverCache.src(m.src || "")} alt="" draggable="false" referrerpolicy="no-referrer" bind:this={img} onload={loaded} style={g ? `width:${g.w}px;height:${g.h}px;left:${g.left}px;top:${g.top}px` : undefined}><div class="fguide"></div></div></div>
    <div class="bar fctl"><span class="hint">Drag to move · scroll to zoom</span><span class="spacer"></span><label class="ctl">Zoom <input type="range" id="fzoom" min="1" max="5" step=".01" value={m.z} oninput={e => store.dialog({ z: +e.currentTarget.value })}></label><button class="btn sm ghost" data-act="frame-reset" onclick={() => store.dialog({ x: 0, y: 0, z: 1 })}>Centre</button></div>
    {#if m.gif}<p class="hint">This is an animated GIF: a framed copy keeps only its first frame.</p>{/if}{#if m.err}<p class="err">{m.err}</p>{/if}
    <div class="bar"><button class="btn gold" data-act="frame-save" disabled={!!m.busy}>{m.busy ? "Saving…" : "Save"}</button><button class="btn ghost" data-act="frame-cancel">Cancel</button></div>{/if}
