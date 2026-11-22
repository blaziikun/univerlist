<!--
    src/features/core/start/Welcome.svelte
    ─────────────────────────────────────────────────────────────────
      The first time it opens: what it is, what to call you, and where to start (an empty library, bringing in what
      you have, or, on the website, signing in to your account). Start, "Bring in what I have" and Enter use your name,
      so they're this one's own; signing in is "welcome-signin" (core/nav-handlers.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { APP_NAME, markDirty, meta } from "../core";
    import { closeModal } from "../modals";
    import { goSettings, render } from "../navigation";

    let name = $state("");
    const web = location.protocol.startsWith("http");
    function begin(then: () => void) {
        meta.settings.welcomed3 = true;
        if (name.trim()) meta.profile.name = name.trim();
        markDirty();
        closeModal();
        then();
    }
    const start = () => begin(render),
        bring = () => begin(() => goSettings("io"));
</script>

<div class="welcome2"><p class="eyebrow">{APP_NAME}</p><h2>Everything you read, watch and play, in one place.</h2>
    <p class="hint">It lives in this browser and works offline. Nothing leaves unless you send it.</p>
    <!-- svelte-ignore a11y_autofocus: your name is the one thing it asks -->
    <label class="wlname"><span>What should it call you?</span><input class="inp" id="wl-name" placeholder="Your name" autocomplete="nickname" autofocus bind:value={name} onkeydown={e => { if (e.key === "Enter") { e.preventDefault(); start(); } }}></label>
    <div class="bar"><button class="btn gold" data-act="welcome-done" onclick={start}>Start</button><button class="btn ghost" data-act="welcome-import" onclick={bring}>Bring in what I have</button>{#if web}<button class="btn ghost" data-act="welcome-signin">Sign in to my account</button>{/if}</div>
    <p class="hint">Press <span class="kbd">/</span> to search and <span class="kbd">+</span> to add. AniList, Letterboxd, MyAnimeList, Goodreads and any CSV come in through Import.</p></div>
