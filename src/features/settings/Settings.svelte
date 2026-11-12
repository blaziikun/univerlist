<!--
    src/features/settings/Settings.svelte
    ─────────────────────────────────────────────────────────────────
      Settings: one page, sections down the side

      General (you, how it opens, titles, dates, scores, offline) · Account & sync · Library · Appearance · Backdrops (beta) ·
      Modes · Data, sources & keys · Private collection · Extensions · Keybinds · Tags · Advanced. Search finds a setting
      in any. Each section is a component in sections/ (Account & sync is the account feature's, Backdrops the backdrops
      feature's). The page is drawn once and updates itself from the store: nothing you're typing in is redrawn.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Icon from "../core/Icon.svelte";
    import { store } from "../core/store.svelte";
    import Account from "../account/Account.svelte";
    // TMDB's mark, as its terms ask, in its own colour and smaller than ours; small enough to be part of the page itself
    import tmdbLogo from "../../assets/tmdb-logo.svg";
    import Advanced from "./sections/Advanced.svelte";
    import Appearance from "./sections/Appearance.svelte";
    import Data from "./sections/Data.svelte";
    import Extensions from "./sections/Extensions.svelte";
    import General from "./sections/General.svelte";
    import Keybinds from "./sections/Keybinds.svelte";
    import Library from "./sections/Library.svelte";
    import Modes from "./sections/Modes.svelte";
    import Privacy from "./sections/Privacy.svelte";
    import Tags from "./sections/Tags.svelte";
    import Backdrops from "../backdrops/Backdrops.svelte";
    import { norm, SOURCE_URL } from "../core/core";
    import { SET_ALIAS, setSecs } from "./settings";
    import DonateLink from "./parts/DonateLink.svelte";

    // the section list and older names for sections ("go-settings io") are kept in settings.ts
    const SECTIONS: Record<string, typeof General> = {
        general: General,
        library: Library,
        appearance: Appearance,
        backdrops: Backdrops,
        modes: Modes,
        data: Data,
        privacy: Privacy,
        ext: Extensions,
        keys: Keybinds,
        tags: Tags,
        advanced: Advanced,
    };

    // Account & sync shows unless it's switched off (Settings › Extensions › Built in)
    const sections = $derived.by(() => {
        void store.meta;
        return setSecs();
    });
    const q = $derived(String(store.ui.setQ || ""));
    const sec = $derived.by(() => {
        const want = SET_ALIAS[String(store.ui.setSec)] || String(store.ui.setSec || "general");
        return sections.some(([k]) => k === want) ? want : "general";
    });
    // searching shows every section (with only what matches); otherwise just the one you picked
    const showing = $derived(q ? sections.map(([k]) => k) : [sec]);

    function open(k: string) {
        store.go({ setSec: k, confirmReset: false });
        scrollTo(0, 0);
        document.dispatchEvent(new CustomEvent("ul:settings-open", { detail: k })); // as goSettings does
    }

    // search: hide every row and panel that doesn't mention what you typed (and every section left with none)
    let body: HTMLElement;
    let none = $state(false);
    $effect(() => {
        void q;
        void showing;
        void store.meta;
        void store.ui;
        const n = norm(q);
        let any = false;
        for (const s of body.querySelectorAll<HTMLElement>(".setsec")) {
            let seen = 0;
            for (const r of s.querySelectorAll<HTMLElement>(".srow")) {
                r.hidden = !!n && !norm(r.textContent || "").includes(n);
                if (!r.hidden) seen++;
            }
            for (const p of s.querySelectorAll<HTMLElement>(".panel")) {
                const rows = [...p.querySelectorAll<HTMLElement>(".srow")];
                p.hidden = !!n && (rows.length ? rows.every(r => r.hidden) : !norm(p.textContent || "").includes(n));
                if (!p.hidden && !rows.length) seen++;
            }
            s.hidden = !!n && !seen;
            if (!s.hidden) any = true;
        }
        none = !!n && !any;
    });
</script>

<div class="settings">
    <nav class="setnav" aria-label="Settings sections">
        <div class="setq">
            <Icon name="search" />
            <input id="set-q" placeholder="Search settings" value={q} autocomplete="off" aria-label="Search settings" oninput={e => store.go({ setQ: e.currentTarget.value })} />
        </div>
        <div class="setsecs">
            {#each sections as [k, l] (k)}
                <button aria-current={!q && sec === k} onclick={() => open(k)}>{l}</button>
            {/each}
        </div>
        <button class="linkbtn setdocs" data-act="go-features">What's in here</button>
        <a class="linkbtn setdocs" href={SOURCE_URL} target="_blank" rel="noopener">Source code</a><DonateLink cls="setdon" />
        <p class="setcredit">
            <a href="https://www.themoviedb.org" target="_blank" rel="noopener"><img src={tmdbLogo} alt="TMDB" width="18" height="18" /></a>
            <span>This product uses the TMDB API but is not endorsed or certified by TMDB.</span>
        </p>
    </nav>
    <div class="setbody" bind:this={body}>
        {#each showing as k (k)}
            <section class="setsec" data-sec={k}>
                <!-- one section going wrong (something odd in imported data, say) leaves the rest of Settings working -->
                <svelte:boundary onerror={e => console.error(e)}>
                    {#if k === "account"}<h2 class="sh">Account & sync</h2><Account />
                    {:else if SECTIONS[k]}{@const Section = SECTIONS[k]}<Section />{/if}
                    {#snippet failed(_, reset)}
                        <p class="err">This part of Settings couldn't be shown. The rest still works. <button class="linkbtn" onclick={reset}>Try again</button></p>
                    {/snippet}
                </svelte:boundary>
            </section>
        {/each}
        <p class="hint setnone" hidden={!none}>No settings match “{q}”.</p>
    </div>
</div>
