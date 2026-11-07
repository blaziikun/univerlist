<!--
    src/features/account/LinkQr.svelte
    ─────────────────────────────────────────────────────────────────
      Account & sync › Sign in on another device: the QR code to scan with its camera (or its link, to open there)
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { acct, hideQr } from "./account-state.svelte";

    let copied = $state(false);
    const minutes = $derived(acct.qr ? Math.max(1, Math.round((acct.qr.expires - Date.now()) / 60e3)) : 0);

    async function copy() {
        await navigator.clipboard?.writeText(acct.qr?.url || "").catch(() => {});
        copied = true;
    }
</script>

{#if acct.qr}
    <div class="acct-card qrcard">
        <h3>Scan this with the other device</h3>
        <p class="hint">On a phone: open the camera, point it at the code, and tap the link that appears. Works for about {minutes} minutes, once.</p>
        <!-- the SVG is made in this page from our own link (link-device.ts), never from anything outside -->
        <div class="qr" role="img" aria-label="QR code to sign in on another device">{@html acct.qr.svg}</div>
        <p class="hint">Another computer? Open the link there instead: <button class="linkbtn" onclick={copy}>{copied ? "copied" : "copy the link"}</button>. Anyone with it can join your account for these few minutes, so only send it to yourself.</p>
        <p class="hint" role="status">Waiting for the other device…</p>
        <div class="bar"><button class="btn sm ghost" onclick={hideQr}>Cancel</button></div>
    </div>
{/if}

<style>
    .qr { width: min(260px, 70vw); background: #fff; padding: 8px; border-radius: 10px; }
    .qr :global(svg) { display: block; width: 100%; height: auto; }
</style>
