<!--
    src/features/settings/sections/Extensions.svelte
    ─────────────────────────────────────────────────────────────────
      Settings › Extensions: the built-in parts you can switch off, the official extensions you can add, dropping in
      your own, and the ones installed (on or off, their settings, private or not, their companion's health).
      The switches, fields and buttons are handled where extensions live (extensions/extensions.ts: data-exton,
      data-extpriv, data-extset, ext-*; builtins.ts: data-builtin), so this only draws it.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { onMount } from "svelte";
    import { store } from "../../core/store.svelte";
    import { APP_NAME, textOf, ui } from "../../core/core";
    import { renderMain } from "../../core/shell";
    import { builtinOn, BUILTINS } from "../../extensions/builtins";
    import { companionOf, EXT, EXT_OFFICIAL, EXT_PERMS, extGet, extPing } from "../../extensions/extensions";

    type Setting = { key: string; label: string; type?: string; default?: unknown; secret?: boolean };
    const first = (s: string) => String(s || "").split(/(?<=[.!?])\s/)[0];

    const v = $derived.by(() => {
        void store.meta;
        void store.ui;
        const open = ui.extOpen || {};
        return {
            builtins: BUILTINS.map(b => ({
                ...b,
                on: builtinOn(b.id),
                first: first(b.desc),
                open: !!open[b.id],
                plugs: EXT.list.filter(x => (x.manifest.permissions || []).some(p => b.jobs.includes(p))).map(x => ({ name: x.manifest.name, private: !!x.private })),
            })),
            official: EXT_OFFICIAL.map(([id, name, desc]) => ({ id, name, desc, added: !!extGet(id) })),
            list: EXT.list.map(x => {
                const m = x.manifest,
                    comp = companionOf(m),
                    saved = x.data?.settings || {};
                const settings: Setting[] = [...(comp ? [{ key: "companionUrl", label: "Companion address", type: "text", default: comp.url }] : []), ...(m.settings || [])];
                return {
                    m,
                    on: !!x.on,
                    private: !!x.private,
                    open: !!open[m.id],
                    first: first(textOf(m.description)),
                    health: EXT.health[m.id],
                    comp,
                    settings: settings.map(s => ({ ...s, value: saved[s.key] ?? s.default ?? "" })),
                };
            }),
        };
    });

    // ask each extension's companion whether it's running, the first time this page opens
    onMount(() => {
        if (EXT.pinged) return;
        EXT.pinged = true;
        Promise.all(EXT.list.map(extPing)).then(() => {
            if (ui.page === "settings") renderMain();
        });
    });
</script>

<h2 class="sh">Extensions</h2>
<div class="panel">
    <h3>Built in <span class="hint">official parts of UniverList you can switch off</span></h3>
    {#each v.builtins as b (b.id)}
        <div class="extrow" class:off={!b.on}>
            <label class="sw"><input type="checkbox" data-builtin={b.id} checked={b.on} aria-label={`${b.name} on or off`} /><span></span></label>
            <details data-bopen={b.id} open={b.open}>
                <summary class="exth"><b>{b.name}</b><span class="pill">Official</span><span class="hint extsum">{b.first}</span></summary>
                <div class="extbody">
                    {#if b.desc !== b.first}<p class="hint">{b.desc}</p>{/if}
                    {#if b.plugs.length}
                        <p class="hint">Plugged into it: {#each b.plugs as p, i (i)}{i ? ", " : ""}<b>{p.name}</b>{p.private ? " (yours, private)" : ""}{/each}</p>
                    {/if}
                    {#if !b.on}<p class="hint">Off: nothing of it shows or runs. Your progress, saved links and servers are kept.</p>{/if}
                </div>
            </details>
        </div>
    {/each}
</div>

<div class="panel">
    <h3>Official extensions</h3>
    <p class="hint">They come with {APP_NAME} but stay out of it until you add them; remove one and nothing of it is left.</p>
    {#each v.official as o (o.id)}
        <div class="srow">
            <div class="sl2"><b>{o.name}</b><p class="hint">{o.desc}</p></div>
            <div class="sc2">{#if o.added}<span class="pill active">added</span>{:else}<button class="btn sm" data-act="ext-official" data-k={o.id}>Add</button>{/if}</div>
        </div>
    {/each}
</div>

<div class="panel">
    <h3>Add an extension</h3>
    <p class="hint">
        Drop a .zip (a folder with <code>extension.json</code>), a single <code>.json</code> or <code>.js</code> extension here, or choose one. Extensions run sealed off from the
        rest of the app: they only get what they ask for below, never your library or keys.
    </p>
    <div class="dropzone extdrop" data-act="ext-pick" tabindex="0" role="button"><b>Drop an extension here, or click to choose</b><span class="hint">.zip · .json · .js</span></div>
</div>

<div class="panel">
    <h3>Installed{v.list.length ? ` · ${v.list.length}` : ""}</h3>
    {#each v.list as x (x.m.id)}
        <div class="extrow" class:off={!x.on}>
            <label class="sw"><input type="checkbox" data-exton={x.m.id} checked={x.on} aria-label={`${x.m.name} on or off`} /><span></span></label>
            <details data-extopen={x.m.id} open={x.open}>
                <summary class="exth">
                    <b>{x.m.name}</b><span class="hint extv">{x.m.version || ""}</span>{#if x.private}<span class="pill">private</span>{/if}<span class="hint extsum">{x.first}</span>
                </summary>
                <div class="extbody">
                    {#if x.m.description && x.m.description !== x.first}<p class="hint">{x.m.description}</p>{/if}
                    {#if x.m.author}<p class="hint">By {x.m.author}</p>{/if}
                    <div class="extd">
                        <span class="chips">{#each x.m.permissions as p, i (i)}<span class="chip" title={EXT_PERMS[p]}>{EXT_PERMS[p]}</span>{/each}</span>
                        {#if x.comp}
                            <p class="hint">
                                Companion: <span class="pill" class:active={x.health === "on"} class:dnf={x.health === "off"}>{x.health === "on" ? "running" : x.health === "off" ? "not running" : "checking…"}</span>
                                <button class="linkbtn" data-act="ext-ping" data-k={x.m.id}>Check again</button>{x.comp.setup ? ` · ${x.comp.setup}` : ""}
                            </p>
                        {/if}
                        {#each x.settings as s, i (i)}
                            {#if s.type === "textarea"}
                                <label class="ctl extta">{s.label}<textarea class="inp" rows="4" data-extset={x.m.id} data-k={s.key} spellcheck="false" value={String(s.value)}></textarea></label>
                            {:else if s.type === "toggle"}
                                <label class="ctl"><input type="checkbox" data-extset={x.m.id} data-k={s.key} checked={!!s.value} /> {s.label}</label>
                            {:else}
                                <label class="ctl">{s.label} <input class="inp" data-extset={x.m.id} data-k={s.key} value={String(s.value)} type={s.type === "number" ? "number" : s.secret ? "password" : "text"} style="max-width:260px" /></label>
                            {/if}
                        {/each}
                        <label class="ctl"><input type="checkbox" data-extpriv={x.m.id} checked={x.private} /> Private: only goes into backups sealed with your backup passphrase</label>
                    </div>
                </div>
            </details>
            <button class="btn sm ghost" data-act="ext-remove" data-k={x.m.id} aria-label={`Remove ${x.m.name}`}>Remove</button>
        </div>
    {:else}
        <p class="hint">None yet.</p>
    {/each}
</div>
