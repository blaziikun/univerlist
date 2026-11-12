<!--
    src/features/settings/sections/General.svelte
    ─────────────────────────────────────────────────────────────────
      Settings › General: your profile, where the app opens, titles and dates, scores, this device
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { onMount } from "svelte";
    import { install, installNow } from "../../core/install.svelte";
    import { store } from "../../core/store.svelte";
    import Group from "../parts/Group.svelte";
    import Row from "../parts/Row.svelte";
    import Seg from "../parts/Seg.svelte";
    import { allModes, changeMeta, clone, coverCache, modeById, plural, SCALES, snapshot, toast } from "../../core/core";
    import { render } from "../../core/navigation";
    import { modeProfile } from "../../core/shell";
    import Avatar from "../../core/shell/Avatar.svelte";
    import { modeChanged } from "../handlers";

    const DATE_FMTS: [string, string][] = [
        ["dmy", "1 Nov 2026"],
        ["mdy", "Nov 1, 2026"],
        ["iso", "2026-11-01"],
    ];
    const TITLES: [string, string][] = [
        ["en", "In your language"],
        ["romaji", "Romanised"],
        ["native", "Original script"],
    ];

    // how much this device holds: your library on its own, and everything with covers and the app kept for offline
    let space = $state<{ library: number; all: number } | null>(null);
    const size = (n: number) =>
        n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(n < 1e8 ? 1 : 0)} MB`;
    onMount(async () => {
        const e = await navigator.storage?.estimate?.().catch(() => null);
        if (e && e.usage) space = { library: new Blob([JSON.stringify(snapshot())]).size, all: e.usage };
    });
    const apple = /Mac|iPhone|iPad/.test(navigator.platform) && !/Chrome|Edg/.test(navigator.userAgent);

    // copies, so a change shows: the older code changes these objects in place (see store.svelte.ts)
    const s = $derived({ ...store.meta.settings });
    const p = $derived({ ...store.meta.profile });
    // the Hub's profile is yours; modes with their own name, picture or bio are listed so you can give them yours
    const mp = $derived.by(() => {
        void store.meta;
        return modeProfile(modeById("universal"));
    });
    const own = $derived(
        store.meta.modes.filter(
            m =>
                m.id !== "universal" &&
                ["name", "avatar", "avatarData", "banner", "bannerData", "bio"].some(x => (m.profile as Record<string, unknown>)?.[x])
        )
    );
    let picked = $state<string[]>([]);

    /** a setting changed: saved, and everything redrawn (titles, dates and scores show all over the app) */
    const set = (key: string, value: unknown) => store.updateMeta(m => (m.settings[key] = value));
    const profile = (key: "name" | "bio", label: string, value: string) =>
        changeMeta(label, "profile", pr => ({ ...pr, [key]: value.trim() }));

    /** the ticked modes drop their own profile and use yours (with Undo) */
    function useMine() {
        if (!picked.length) return toast("Tick the modes first.");
        const before = picked.map(id => [id, clone(modeById(id).profile || {})] as const);
        for (const id of picked) modeById(id).profile = {};
        modeChanged();
        render();
        toast(`${plural(picked.length, "mode")} now use${picked.length === 1 ? "s" : ""} your profile`, {
            label: "Undo",
            fn: () => {
                for (const [id, pr] of before) modeById(id).profile = pr;
                modeChanged();
                render();
            },
        });
        picked = [];
    }
</script>

<h2 class="sh">General</h2>
<Group title="Your profile">
    <div class="gprof">
        <!-- style:background-image sets only that one property, so an odd banner address can't add any other styling -->
        <div class="gpban" style:background-image={mp.banner ? `url("${coverCache.src(mp.banner).replace(/["\\\n\r]/g, encodeURIComponent)}")` : null}>
            <!-- the profile editor is shared with every mode's header (library/profile-handlers.ts) -->
            <button class="btn sm" data-act="profile-edit" data-k="universal">{mp.banner ? "Change banner" : "Add a banner"}</button>
        </div>
        <div class="gpbody">
            <button class="gpav" data-act="profile-edit" data-k="universal" aria-label="Change picture"><Avatar {mp} size={72} /></button>
            <div class="gpf">
                <input class="inp" id="set-name" value={p.name || ""} placeholder="Your name" aria-label="Your name" onchange={e => profile("name", "Name", e.currentTarget.value)} />
                <textarea class="inp" id="set-bio" rows="3" placeholder="A line or two about you" aria-label="Bio" value={p.bio || ""} onchange={e => profile("bio", "Bio", e.currentTarget.value)}></textarea>
            </div>
        </div>
    </div>
    <p class="hint">
        This is your profile in Hub, and in every mode that doesn't have its own.{#if own.length}
            {own.map(m => m.name).join(", ")} {own.length === 1 ? "has its" : "have their"} own.{/if}
    </p>
    {#if own.length}
        <details class="gpover">
            <summary class="linkbtn">Use this one in…</summary>
            <div class="bar">
                {#each own as m, i (i)}
                    <label class="ctl"><input type="checkbox" value={m.id} bind:group={picked} /> {m.name}</label>
                {/each}
                <button class="btn sm" onclick={useMine}>Replace theirs</button>
            </div>
        </details>
    {/if}
</Group>

<Group title="Opening">
    <Row label="Open in" hint="A refresh always brings you back to where you were.">
        <select class="sel" id="set-startmode" aria-label="Open in" value={s.startMode || "universal"} onchange={e => set("startMode", e.currentTarget.value)}>
            {#each allModes().filter(m => !m.sealedOnly) as m, i (i)}<option value={m.id}>{m.name}</option>{/each}
            <option value="last">Wherever I left off</option>
        </select>
    </Row>
    <Row label="Each mode opens on" hint="Pick a mode's ★ tab with ⋯ at the end of its tabs.">
        <select class="sel" aria-label="Each mode opens on" value={s.modeOpens === "home" ? "home" : "last"} onchange={e => set("modeOpens", e.currentTarget.value)}>
            <option value="last">The tab I was last on there</option>
            <option value="home">Its ★ tab</option>
        </select>
    </Row>
</Group>

<Group title="Language and dates">
    <Row label="Language" hint="More languages to come."><span class="hint">English</span></Row>
    <Row label="Titles" hint="For anime, manga and anything else with a title in another script: Shingeki no Kyojin is the romanised form of 進撃の巨人; in English it's Attack on Titan.">
        <Seg label="Titles" options={TITLES} value={String(s.titleLang || "en")} onpick={k => set("titleLang", k)} />
    </Row>
    <Row label="Dates"><Seg label="Dates" options={DATE_FMTS} value={String(s.dateFmt || "dmy")} onpick={k => set("dateFmt", k)} /></Row>
</Group>

<Group title="Scores">
    <Row label="Scale" hint="Your usual scale. Any title can have its own (on its card), and every score is kept out of 10 underneath, so they compare and rank together: 4½ stars is 9/10.">
        <Seg label="Scale" options={SCALES} value={String(s.ratingScale || "10d")} onpick={k => set("ratingScale", k)} />
    </Row>
    <Row label="Rate in detail"><p class="hint">Each mode has its own parts to score (story, art, gameplay…): Settings › Modes.</p></Row>
</Group>

<Group title="This device">
    <Row label="Keep a copy on this device" hint="Stored by this browser only. Turn it off to save space.">
        <label class="ctl"><input type="checkbox" id="set-offauto" checked={s.offlineAuto !== false} onchange={e => store.updateMeta(m => (m.settings.offlineAuto = e.currentTarget.checked))} />
            Covers and details, so everything opens instantly and works offline <span class="pill">recommended</span></label>
    </Row>
    {#if space}
        <Row label="Space used">
            <p class="hint">
                Your library takes {size(space.library)}. With covers, details and the app kept for offline use, {size(space.all)}
                in all.
            </p>
        </Row>
    {/if}
    {#if location.protocol.startsWith("http")}
        <Row label="Install" hint="Its own window and icon, opens offline, and the browser is less likely to clear it.">
            {#if install.installed}
                <p class="hint">Installed on this device.</p>
            {:else if install.offer}
                <button class="btn" id="set-install" onclick={installNow}>Install UniverList</button>
            {:else if apple}
                <p class="hint">In Safari: File › Add to Dock on a Mac, or Share › Add to Home Screen on an iPhone or iPad.</p>
            {:else}
                <p class="hint">From the browser's menu (Install, or Add to Home Screen). Firefox on a computer can't install sites: a tab works the same.</p>
            {/if}
        </Row>
    {/if}
</Group>
