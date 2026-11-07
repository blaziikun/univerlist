<!--
    src/features/settings/sections/Modes.svelte
    ─────────────────────────────────────────────────────────────────
      Settings › Modes: a mode is a lens over your library (what it shows, its shelves, theme and detailed ratings). Pick
      one, then change its name and look, what it shows and its shelves, the parts it rates, or copy or delete it. The
      buttons and fields are handled by the classic code under the same names (settings/handlers.js: edit-mode, mode-*,
      shelf-*; core/events.js: data-mm, data-modetheme, data-shelfname, data-critm, data-splitmode, hub-hide), so this only
      draws it. The "what it shows" grids are still the classic HTML (matrixHTML in settings.js): reading them back depends
      on it.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import Group from "../parts/Group.svelte";
    import Row from "../parts/Row.svelte";

    type Shelf = { name: string; match?: string[] };
    const v = $derived.by(() => {
        void store.meta;
        void store.ui;
        void store.items;
        const m = editingMode(),
            custom = Array.isArray(m.shelves),
            modeMedia = MEDIA_KEYS.filter(k => kindToggles((m.match as string[]) || ["*"], k).some(x => x[1])),
            C = (meta.settings.criteria || {}) as Record<string, string[]>,
            shelves = (custom ? (m.shelves as Shelf[]) : shelvesOf(m).map(s => ({ name: s.name }))) as Shelf[];
        return {
            m,
            idx: meta.modes.indexOf(m),
            count: meta.modes.length,
            uni: m.id === "universal",
            space: isSpace(m),
            custom,
            shelves,
            list: meta.modes.map(x => ({ id: x.id, name: x.name, g: x.g as string | undefined, hidden: !!x.hidden, accent: String(resolveTheme(x.theme).accent) })),
            themes: themeOpts(),
            view: curView(m),
            group: curGroup(m),
            sort: curSort(m),
            shows: describePats(m.match as string[]),
            matrix: matrixHTML((m.match as string[]) || [], "mode"),
            shelfMode: custom ? "custom" : String(m.shelves || "kind"),
            shelfRows: custom ? shelves.map((s, i) => ({ s, i, shows: describePats(s.match), matrix: matrixHTML(s.match || [], "shelf" + i, modeMedia) })) : [],
            openShelf: ui.openShelf as number | undefined,
            types: typesSettingsHTML(m),
            crit: (modeMedia.length ? modeMedia : MEDIA_KEYS).map(k => [k, MEDIA[k].name, (C[k] || DEFAULT_CRITERIA[k] || []).join(", ")] as const),
            confirmDel: !!ui.confirmModeDel,
        };
    });
</script>

{#snippet sel(id: string, opts: [string, string][], val: string, label: string)}
    <select class="sel" {id} aria-label={label}>
        {#each opts as [k, l] (k)}<option value={k} selected={String(val) === String(k)}>{l}</option>{/each}
    </select>
{/snippet}

<h2 class="sh">Modes</h2>
<p class="hint" style="margin-bottom:12px">A mode is a lens over your library: what it shows, its shelves, its theme and its own detailed ratings. Pick one to change it.</p>
<div class="modelist">
    {#each v.list as x, i (i)}
        <button class="mchip" class:on={x.id === v.m.id} class:off={x.hidden} data-act="edit-mode" data-k={x.id} style={`--mc:${x.accent}`}><span>{x.g || "•"}</span>{x.name}</button>
    {/each}
    <button class="mchip add" data-act="mode-new">+ New mode</button>
</div>
<div class="scopebar">
    <span><b>{v.m.name}</b>{v.uni ? " · Hub always stays; you can hide it" : v.space ? " · an extension's mode: switch it off in Settings › Extensions" : ""}</span>
    <span class="spacer"></span>
    <span class="mvpair">
        <button class="btn sm ghost" data-act="mode-move" data-k="-1" disabled={v.idx <= 0} aria-label="Move earlier" title="Move earlier">←</button>
        <button class="btn sm ghost" data-act="mode-move" data-k="1" disabled={v.idx >= v.count - 1} aria-label="Move later" title="Move later">→</button>
    </span>
</div>

<!-- keyed by the mode: picking another one draws its fields afresh, instead of leaving what you typed for the last one -->
{#key v.m.id}
    <Group title="Name and look">
        <Row label="Name">
            <div class="bar">
                <input class="inp" id="mode-glyph" value={v.m.g || ""} maxlength="2" style="width:52px;text-align:center" aria-label="Symbol" />
                <input class="inp" id="mode-name" value={v.m.name} maxlength="24" style="max-width:240px" aria-label="Mode name" />
            </div>
        </Row>
        <Row label="Theme" hint="Edit themes under Appearance.">
            <div class="bar">
                <select class="sel" data-modetheme={v.m.id} aria-label="Theme">
                    {#each v.themes as [k, l] (k)}<option value={k} selected={v.m.theme === k}>{l}</option>{/each}
                </select>
                <button class="btn sm ghost" data-act="mode-to-all" data-k="theme">Use it in every mode</button>
            </div>
        </Row>
        <Row label="Opens with">
            <div class="bar">
                <label class="ctl">View {@render sel("mode-view", VIEW_LIST, v.view, "View")}</label>
                <label class="ctl">Group {@render sel("mode-group", GROUPS, v.group, "Group")}</label>
                <label class="ctl">Sort {@render sel("mode-sort", SORTS, v.sort, "Sort")}</label>
                <button class="btn sm ghost" data-act="mode-to-all" data-k="view">Use in every mode</button>
            </div>
        </Row>
    </Group>

    <Group title="What it shows">
        {#if v.uni}
            <p class="hint">Everything except Games (and academic books while the Learning Centre is on).</p>
        {:else}
            <details><summary class="hint">{v.shows}</summary>{@html v.matrix}</details>
        {/if}
        <Row label="Shelves">
            <div class="bar" style="margin-bottom:8px">
                <div class="seg">
                    {#each [["custom", "My own shelves"], ...SHELF_AUTO] as [k, l] (k)}
                        <button data-act="mode-shelfmode" data-k={k} aria-pressed={v.shelfMode === k}>{l}</button>
                    {/each}
                </div>
            </div>
            {#if v.custom}
                <div class="shelfed">
                    {#each v.shelfRows as { s, i, shows, matrix } (i)}
                        <div class="shrow">
                            <div class="bar">
                                <input class="inp" data-shelfname={i} value={s.name} style="max-width:220px" aria-label="Shelf name" />
                                <button class="btn sm ghost" data-act="shelf-move" data-k={i} data-d="-1" disabled={i === 0} aria-label="Up">↑</button>
                                <button class="btn sm ghost" data-act="shelf-move" data-k={i} data-d="1" disabled={i === v.shelfRows.length - 1} aria-label="Down">↓</button>
                                <button class="btn sm" data-act="shelf-split" data-k={i}>Split by type</button>
                                {#if i < v.shelfRows.length - 1}<button class="btn sm" data-act="shelf-merge" data-k={i}>Merge with next</button>{/if}
                                <button class="btn sm ghost" data-act="shelf-del" data-k={i} aria-label="Delete shelf">✕</button>
                            </div>
                            <details open={v.openShelf === i}><summary class="hint">Includes: {shows}</summary>{@html matrix}</details>
                        </div>
                    {/each}
                    <button class="btn sm" data-act="shelf-add">+ Shelf</button>
                </div>
            {:else}<p class="hint">Made from what's in this mode.</p>{/if}
        </Row>
        {#if !v.uni && !v.space}
            <Row label="Types here" hint="What each type is called in this mode, and which ones count as one. The same names show everywhere the type does.">
                <div class="ktypes">{@html v.types}</div>
            </Row>
            {#if v.shelves.length > 1}
                <Row label="Split into modes" hint={`Each ticked shelf becomes a mode of its own (with ${v.m.name}'s look) and leaves this one: Culture into Anime and Manga, say.`}>
                    <div class="bar">
                        {#each v.shelves as s, i (i)}<label class="ctl"><input type="checkbox" data-splitmode={i} /> {s.name}</label>{/each}
                        <button class="btn sm" data-act="mode-split">Make each its own mode</button>
                    </div>
                </Row>
            {/if}
        {/if}
    </Group>

    <Group title="Rate in detail" open={false}>
        <p class="hint">On any card, “Rate in detail” scores the parts and can make their average your score. The parts for what this mode shows (separate with commas):</p>
        <div class="critedit">
            {#each v.crit as [k, name, parts] (k)}
                <label class="ctl"><span style="width:110px">{name}</span><input class="inp" data-critm={k} value={parts} style="flex:1" aria-label={`Parts to rate for ${name}`} /></label>
            {/each}
        </div>
    </Group>

    <Group title={v.uni ? "Hide" : "Copy or delete"} open={false}>
        <div class="bar">
            <button class="btn sm" data-act="mode-dup">Duplicate {v.m.name}</button>
            {#if v.uni}
                <label class="ctl"><input type="checkbox" data-act2="hub-hide" checked={!!v.m.hidden} id="hub-hide" /> Hide Hub from the menus</label>
            {:else if !v.space}
                {#if v.confirmDel}
                    <span class="err">Delete {v.m.name}? Nothing in your library is deleted.</span>
                    <button class="btn sm danger" data-act="mode-del-yes">Delete it</button>
                    <button class="btn sm ghost" data-act="mode-del-no">Keep</button>
                {:else}<button class="btn sm danger" data-act="mode-del">Delete {v.m.name}…</button>{/if}
            {/if}
            <button class="btn sm ghost" data-act="mode-look-reset">Reset its look</button>
        </div>
    </Group>
{/key}
