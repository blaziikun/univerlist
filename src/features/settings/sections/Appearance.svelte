<!--
    src/features/settings/sections/Appearance.svelte
    ─────────────────────────────────────────────────────────────────
      Settings › Appearance: themes, and everything about the look (colours, type, shape, the backdrop behind the page, the
      header and sidebar, Watch & read). You edit one theme at a time; any mode can use it.
      What each control does is in the classic handlers, found by the same names (settings/handlers.js: theme-*, set-amb,
      set-logo, side-pos, layout-reset; core/events.js: data-theme, data-themehex, data-stagetheme), so this only draws it.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import Group from "../parts/Group.svelte";
    import Row from "../parts/Row.svelte";

    type Theme = Record<string, string | number> & { name?: string };
    const CASES: [string, string][] = [
        ["none", "As typed"],
        ["uppercase", "UPPERCASE"],
        ["lowercase", "lowercase"],
        ["capitalize", "Capitalised"],
    ];
    const AMB: [string, string][] = [
        ["off", "Still"],
        ["calm", "Calm"],
        ["alive", "Alive"],
    ];
    const LOGOS: [string, string][] = [
        ["two", "Two-tone"],
        ["gradient", "Gradient"],
        ["accent", "Accent"],
        ["plain", "Plain"],
    ];
    const COLOURS: [string, string][] = [
        ["bg", "Background"],
        ["panel", "Panels"],
        ["text", "Text"],
        ["accent", "Accent"],
        ["muted", "Secondary text"],
        ["hi", "Highlight"],
    ];
    // [theme key, label, min, max, step]
    type Range = [string, string, number, number, number];
    const LOOK: Range[] = [
        ["bgAmt", "Background strength", 0, 1, 0.05],
        ["glow", "Glow", 0, 1, 0.05],
    ];
    const TYPE: Range[] = [
        ["fsTitle", "Title size", 18, 56, 1],
        ["fs", "Text size", 11, 18, 0.5],
        ["ls", "Letter spacing", -0.06, 0.2, 0.01],
    ];
    const SHAPE: Range[] = [
        ["radius", "Corners", 0, 24, 1],
        ["cover", "Card size", 84, 220, 2],
        ["gap", "Spacing", 6, 32, 1],
    ];

    // everything this page shows, worked out again whenever anything changes (the theme code changes things in place)
    const v = $derived.by(() => {
        void store.meta;
        void store.ui;
        const m = editingMode(),
            tid = editThemeId(),
            T = resolveTheme(tid) as Theme;
        return {
            m,
            tid,
            T,
            users: themesUsing(tid).map(x => x.name),
            prev: ui.previewTheme as string | null,
            side: { ...(meta.layout.side as object) } as { pos: string; startOpen: boolean; text?: string; width: number },
            amb: String(meta.settings.ambience || "calm"),
            logo: String(meta.settings.logo || "two"),
            cards: themeList().map(([k]) => {
                const r = resolveTheme(k) as Theme;
                return { k, r, users: themesUsing(k).map(x => x.name) };
            }),
            backdrops: [...BACKDROPS, ...myBackdropChoices()],
            stage: STAGE_LOOKS(),
            stageNow: stageLook(),
            preset: !!THEME_PRESETS[tid],
            sideKey: keyLabel(keyFor("sidebar")),
        };
    });
    const weights = (f: string) => (FONTS[f] || FONTS.Inter)[0];
</script>

{#snippet range([k, l, a, b, st]: Range)}
    <label class="ctl rangec"><span>{l}</span>
        <input type="range" data-theme={k} min={a} max={b} step={st} value={v.T[k]} />
        <!-- the number beside it is also written as you drag (events.js); drawn afresh when the theme changes -->
        {#key v.T[k]}<output>{themeFmt(k, v.T[k])}</output>{/key}
    </label>
{/snippet}
{#snippet seg(act: string, opts: [string, string][], val: string)}
    <div class="seg">
        {#each opts as [k, l] (k)}<button data-act={act} data-k={k} aria-pressed={val === k}>{l}</button>{/each}
    </div>
{/snippet}

<h2 class="sh">Appearance</h2>
<Group title="Themes">
    <div class="tcards">
        {#each v.cards as c (c.k)}
            <div class="tcard" class:cur={v.tid === c.k} class:prev={v.prev === c.k}>
                <button class="tcb" data-act="theme-edit" data-k={c.k} style={`background:${c.r.bg};color:${c.r.text};--ta:${c.r.accent}`} title={`Edit ${c.r.name || c.k}`}>
                    <span class="sw">{#each [c.r.panel, c.r.accent, c.r.hi, c.r.muted] as col, i (i)}<i style={`background:${col}`}></i>{/each}</span>
                    <b style={`font-family:${fontStack(String(c.r.fHead))};font-weight:${c.r.wHead};text-transform:${c.r.tt}`}>{c.r.name || c.k}</b>
                    <small style={`color:${c.r.muted}`}>{c.users.length ? c.users.join(", ") : "Not used"}</small>
                </button>
                {#if v.cards.length > 1}
                    <button class="tdel" data-act="theme-del" data-k={c.k} title="Delete this theme" aria-label={`Delete ${c.r.name || c.k}`}>✕</button>
                {/if}
            </div>
        {/each}
        <button class="tcard tnew" data-act="theme-dup" title="A new theme, copied from the one you're editing">+ New theme</button>
    </div>
    <div class="note">
        Editing <b>{v.T.name || v.tid}</b>{v.users.length ? `, used by ${v.users.join(", ")}` : ", not used by any mode"}.
        {#if v.m.theme === v.tid}
            You're seeing it now, on {v.m.name}.
        {:else}
            <button class="btn sm" data-act="theme-preview" data-k={v.tid}>{v.prev === v.tid ? "Previewing" : "Preview it here"}</button>
            <button class="btn sm gold" data-act="theme-assign" data-k={v.m.id}>Use it for {v.m.name}</button>
        {/if}
    </div>
</Group>

<Group title="Colours">
    <div class="colors">
        {#each COLOURS as [k, l] (k)}
            <label class="ctl colorc">
                <input type="color" data-theme={k} value={v.T[k]} aria-label={l} /><span>{l}</span>
                <input class="inp hex" data-themehex={k} value={v.T[k]} maxlength="7" aria-label={`${l} hex`} />
            </label>
        {/each}
    </div>
    <div class="bar">{#each LOOK as r (r[0])}{@render range(r)}{/each}</div>
</Group>

<Group title="Typography">
    <div class="bar">
        {#each [["fHead", "wHead", "Headings", "Heading font"], ["fUi", "wUi", "Text", "Text font"]] as [f, w, l, aria] (f)}
            <label class="ctl">{l}
                <select class="sel" data-theme={f} aria-label={aria}>
                    {#each Object.keys(FONTS) as name (name)}<option value={name} selected={name === v.T[f]}>{name}</option>{/each}
                </select>
                <select class="sel" data-theme={w} aria-label={`${l} weight`}>
                    {#each weights(String(v.T[f])) as wt (wt)}<option value={wt} selected={wt === Number(v.T[w])}>{wt}</option>{/each}
                </select>
            </label>
        {/each}
        <label class="ctl">Headings in
            <select class="sel" data-theme="tt" aria-label="Headings in">
                {#each CASES as [k, l] (k)}<option value={k} selected={v.T.tt === k}>{l}</option>{/each}
            </select>
        </label>
    </div>
    <div class="bar">{#each TYPE as r (r[0])}{@render range(r)}{/each}</div>
</Group>

<Group title="Shape">
    <div class="bar">{#each SHAPE as r (r[0])}{@render range(r)}{/each}</div>
    <Row label="Spines" hint="Books and games on a shelf. Real spine photos exist for games (from your proxy); for everything else a slice of the cover stands in, sized like the real thing.">
        {@render seg("theme-spine", [["cover", "Cut from the cover"], ["colour", "Solid colour"]], String(v.T.spine))}
    </Row>
</Group>

<Group title="Backdrop and ambience">
    <Row label="Background" hint="The living layer behind the page: drifting stars, a projector beam, lamplight, rain.">
        <div class="bar">
            <label class="ctl">Style
                <select class="sel" data-theme="bgStyle" aria-label="Background style">
                    {#each BG_STYLES as [k, l] (k)}<option value={k} selected={v.T.bgStyle === k}>{l}</option>{/each}
                </select>
            </label>
            <label class="ctl">Backdrop
                <select class="sel" data-theme="backdrop" aria-label="Backdrop">
                    {#each v.backdrops as [k, l], i (i)}<option value={k} selected={v.T.backdrop === k}>{l}</option>{/each}
                </select>
            </label>
        </div>
    </Row>
    <Row label="Movement" hint="Calm keeps the backdrop slow and quiet; Alive adds movement as you scroll and point. Your system's reduce-motion setting always wins.">
        {@render seg("set-amb", AMB, v.amb)}
    </Row>
</Group>

<Group title="Header and sidebar">
    <Row label="Logo">{@render seg("set-logo", LOGOS, v.logo)}</Row>
    <Row label="Sidebar" hint={`Toggle it with ${v.sideKey}.`}>
        <div class="bar">
            {@render seg("side-pos", [["left", "Left"], ["right", "Right"]], v.side.pos)}
            <label class="ctl"><input type="checkbox" id="side-start" checked={!!v.side.startOpen} /> Open at start</label>
        </div>
    </Row>
    <Row label="Sidebar text">{@render seg("side-text", SIDE_TEXT, v.side.text || "m")}</Row>
    <Row label="Sidebar width">
        <label class="ctl rangec">
            <input type="range" id="side-w" min="170" max="380" step="5" value={v.side.width} aria-label="Sidebar width" />
            {#key v.side.width}<output>{v.side.width}px</output>{/key}
        </label>
    </Row>
</Group>

<Group title="Watch & read" open={false}>
    <Row label="Look" hint="The player and the reader: black by default, or a theme of yours.">
        <select class="sel" data-stagetheme="1" aria-label="Look">
            {#each v.stage as [k, l], i (i)}<option value={k} selected={String(v.stageNow) === String(k)}>{l}</option>{/each}
        </select>
    </Row>
</Group>

<Group title="Reset" open={false}>
    <div class="bar">
        {#if v.preset}<button class="btn ghost" data-act="theme-reset">Reset {v.T.name || v.tid} to how it came</button>{/if}
        <button class="btn ghost" data-act="layout-reset">Reset the sidebar and layout</button>
    </div>
</Group>
