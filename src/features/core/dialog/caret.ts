// src/features/core/dialog/caret.ts
// ─────────────────────────────────────────────────────────────────
//  A text box a dialog focuses as it opens starts with the caret at the top, as one drawn as HTML did (its text was
//  its default, so the browser put the caret before it). Svelte sets the text afterwards, which puts the caret, and
//  the box's scroll, at the end.   <textarea use:caretAtStart …>
// ─────────────────────────────────────────────────────────────────

export function caretAtStart(el: HTMLTextAreaElement | HTMLInputElement) {
    try {
        el.setSelectionRange(0, 0);
    } catch (_) {}
    el.scrollTop = 0;
    el.scrollLeft = 0;
}
