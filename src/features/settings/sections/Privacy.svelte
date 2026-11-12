<!--
    src/features/settings/sections/Privacy.svelte
    ─────────────────────────────────────────────────────────────────
      Settings › Private collection: a separate library behind a passphrase. Create it, open or lock it, and (while it's
      open) its own mode name, the types that stay in it and extra places to search. Its buttons and fields are handled
      with the vault (library/profile-handlers.ts: vault-*; core/nav-handlers.ts: private-toggle; core/events.ts:
      vault-auto; settings.ts: sp-*), and what you set here is stored encrypted inside the collection, never in the clear.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import Row from "../parts/Row.svelte";
    import { MEDIA, MEDIA_KEYS, meta, SEALED_MODE, ui, vault, vaultReady } from "../../core/core";

    const AUTO: [number, string][] = [
        [0, "Only when I lock it or close UniverList"],
        [5, "After 5 minutes in the background"],
        [15, "After 15 minutes in the background"],
        [60, "After an hour in the background"],
    ];
    // the vault is changed in place by the older code: read it again whenever anything changes
    const v = $derived.by(() => {
        void store.meta;
        void store.ui;
        void store.items;
        const P = vault.prefs || { kinds: {}, links: [] };
        return {
            ready: vaultReady(),
            made: !!meta.vault,
            open: !!vault.key,
            count: vault.key ? vault.ids.size : Number((meta.vault as { n?: number } | null)?.n || 0),
            inside: !!ui.private,
            auto: Number(meta.settings.vaultAuto || 0),
            name: SEALED_MODE.name,
            kinds: MEDIA_KEYS.map(m => [m, MEDIA[m].name, [...(P.kinds[m] || [])]] as const),
            links: [...(P.links || [])],
        };
    });
</script>

<h2 class="sh">Private collection</h2>
<p class="hint" style="margin-bottom:12px">
    A separate, hidden library behind a passphrase. It never mixes with the main one: open it from the mode menu and every mode, shelf, favourite and
    list works the same, for private entries only. It's encrypted (AES-256) with your passphrase and never stored unencrypted. If you forget the
    passphrase it can't be recovered.
</p>
{#if !v.ready}
    <p class="err">This browser can't do the encryption here.</p>
{:else if !v.made}
    <div class="panel" style="max-width:460px">
        <div class="fields">
            <div class="field full"><label for="vp1">Passphrase</label><input id="vp1" type="password" autocomplete="new-password" /></div>
            <div class="field full"><label for="vp2">Again</label><input id="vp2" type="password" autocomplete="new-password" /></div>
        </div>
        <div class="bar" style="margin-top:10px"><button class="btn gold" data-act="vault-create">Create the private collection</button></div>
    </div>
{:else}
    <div class="panel">
        <Row label="Status"><span><b>{v.open ? "🔓 Unlocked" : "🔒 Locked"}</b> · {v.count} entries</span></Row>
        <Row label="Actions">
            {#if v.open}
                <div class="bar">
                    <button class="btn gold" data-act="private-toggle">{v.inside ? "Leave it" : "Open it"}</button>
                    <button class="btn" data-act="vault-lock">Lock now</button>
                    <button class="btn" data-act="vault-pass">Change passphrase</button>
                </div>
            {:else}<button class="btn gold" data-act="private-toggle">Unlock…</button>{/if}
        </Row>
        {#if v.open}
            <!-- only while it's open: these are stored encrypted inside it -->
            <Row label="Its mode" hint="What the private collection's own mode is called in your mode menu.">
                <input class="inp" id="sp-name" value={v.name} style="max-width:240px" aria-label="Its mode" />
            </Row>
            <Row label="Types that stay private" hint="Anything of these types moves in here when you open it, and its type only appears in menus while you're in here.">
                <div class="sptypes">
                    {#each v.kinds as [m, name, ks] (m)}
                        <div class="sprow">
                            <span class="hint">{name}</span>
                            {#each ks as k, i (k)}
                                <span class="chip">{k}<button class="linkbtn" data-act="sp-kind-del" data-k={m} data-i={i} aria-label={`Remove ${k}`}>✕</button></span>
                            {/each}
                            <!-- drawn afresh once a type is added, so the box is empty again -->
                            {#key ks.length}<input class="inp sm" data-spkind={m} placeholder="+ type" aria-label={`Add a private type to ${name}`} />{/key}
                        </div>
                    {/each}
                </div>
            </Row>
            <Row label="Extra places to search" hint="While you're in here, search shows these as extra buttons; {'{q}'} becomes what you typed. They open in a new tab.">
                <div class="splinks">
                    {#each v.links as l, i (i)}
                        <div class="sprow"><b>{l.name}</b><code>{l.url}</code><button class="linkbtn" data-act="sp-link-del" data-i={i}>remove</button></div>
                    {/each}
                    {#key v.links.length}<div class="sprow">
                        <input class="inp sm" id="sp-lname" placeholder="Name" aria-label="Name" />
                        <input class="inp" id="sp-lurl" placeholder={"https://example.com/search?q={q}"} style="flex:1" aria-label="Search address" />
                        <button class="btn sm" data-act="sp-link-add">Add</button>
                    </div>{/key}
                </div>
            </Row>
        {/if}
        <Row label="Auto-lock">
            <select class="sel" id="vault-auto" aria-label="Auto-lock">
                {#each AUTO as [k, l] (k)}<option value={k} selected={v.auto === k}>{l}</option>{/each}
            </select>
        </Row>
    </div>
{/if}
