<!--
    src/features/account/SaveCode.svelte
    ─────────────────────────────────────────────────────────────────
      Account & sync: your recovery code, shown once. Saved somewhere (a file, a photo, on paper), it's the way back to
      your cloud copy if you ever lose every device; nobody can reset it, not even the site.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { acct, codeSaved } from "./account-state.svelte";

    let saved = $state(false),
        copied = $state(false);

    function download() {
        const text = `UniverList recovery code\n\n${acct.code}\n\nIf you ever lose every device you use UniverList on, sign in on a new one and type this code to get your library back.\nKeep it somewhere safe and private. Made ${new Date().toLocaleDateString()}.\n`;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
        a.download = "UniverList recovery code.txt";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    async function copy() {
        await navigator.clipboard?.writeText(acct.code).catch(() => {});
        copied = true;
    }
</script>

<div class="acct-card">
    <h3>Save your recovery code</h3>
    <p class="hint">
        If you ever lose every device you use UniverList on, this code gets your library back. Nobody can reset it, not even
        the site, so keep it somewhere safe: download it, take a photo, or write it down.
    </p>
    <p class="code" aria-label="Your recovery code">{acct.code}</p>
    <div class="bar">
        <button class="btn" onclick={download}>Download it</button>
        <button class="btn" onclick={copy}>{copied ? "Copied" : "Copy it"}</button>
    </div>
    <label class="bar"><input type="checkbox" bind:checked={saved} /> I've saved it somewhere safe</label>
    <div class="bar"><button class="btn gold" disabled={!saved} onclick={codeSaved}>Done</button></div>
</div>

<style>
    .code { font-family: var(--f-mono, monospace); font-size: 22px; letter-spacing: 0.06em; margin: 4px 0; user-select: all; word-break: break-all; }
</style>
