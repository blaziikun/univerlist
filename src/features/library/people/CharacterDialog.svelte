<!--
    src/features/library/people/CharacterDialog.svelte
    ─────────────────────────────────────────────────────────────────
      A character you saved: the picture (and every other one you keep, to switch between or view large), the rank,
      the name, what they're from, the group, why they're a favourite, their traits and what's known about them, and
      Remove (asked first).

      Opened by "open-char" and the character menus (core/modals.ts draws the frame; core/dialogs.ts mounts this). The
      picture being viewed and the "Remove?" question are the dialog's state (ui.modal.view, .confirmDelete); what you
      type is this one's until Save. Buttons that change the character without anything typed (a picture, a tag,
      Remove) are library/people-handlers.ts's.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { changeMeta, MEDIA, titleOf, toast } from "../../core/core";
    import { all } from "../../core/views";
    import { idFromOption } from "../../core/navigation";
    import DialogHead from "../../core/dialog/DialogHead.svelte";
    import Pic from "../../core/dialog/Pic.svelte";
    import { CHAR_GROUPS, charGallery, charGroup, charImg } from "../connect";
    import { patchChar } from "../item-actions";
    import CharViewer from "./CharViewer.svelte";

    const v = $derived.by(() => {
        void store.items;
        const m = store.ui.modal;
        if (!m || m.kind !== "char") return null;
        const c = store.meta.chars.find(x => x.id === m.id);
        return { m: { ...m }, c: c ? { ...c, media: [...(c.media || [])], tags: [...(c.tags || [])] } : null };
    });
    // what you type, until Save: the character's own at first
    const first = store.meta.chars.find(x => x.id === store.ui.modal?.id);
    let rank = $state(first ? String(first.rank || "") : ""),
        name = $state(first?.name || ""),
        why = $state(first?.why || ""),
        from = $state(""),
        tag = $state(""),
        url = $state("");
    const opts = $derived(
        all()
            .sort((a, b) => titleOf(a).localeCompare(titleOf(b)))
            .map(x => `${titleOf(x)} · ${MEDIA[x.medium].one}`)
    );
    const otherTags = $derived([...new Set(store.meta.chars.flatMap(x => x.tags || []))].filter(t => !(v?.c?.tags || []).includes(t)));

    function save() {
        const id = v?.c?.id;
        if (!id) return;
        const at = parseInt(rank, 10);
        const p = { name: name.trim() || v?.c?.name || "", why: why.trim() };
        changeMeta("Edit character", "chars", list => {
            let L = list.map(x => (x.id === id ? { ...x, ...p } : x)).sort((a, b) => (a.rank || 999) - (b.rank || 999));
            const me = L.find(x => x.id === id);
            if (Number.isFinite(at) && at > 0 && me) {
                L = L.filter(x => x.id !== id);
                L.splice(Math.min(at - 1, L.length), 0, me);
            }
            return L.map((x, i) => ({ ...x, rank: i + 1 }));
        });
        rank = String(store.meta.chars.find(x => x.id === id)?.rank || "");
        toast("Saved");
    }
    function addFrom() {
        const c = v?.c,
            fid = idFromOption(from),
            it = fid ? store.item(fid) : undefined;
        if (!c || !fid || !it) return;
        patchChar(c.id, { media: [...(c.media || []).filter(x => x.id !== fid), { id: fid, alId: it.ext.anilist, title: titleOf(it), medium: it.medium }] });
        from = "";
    }
    function addTag(e: KeyboardEvent) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const t = tag.trim(),
            c = v?.c;
        if (!t || !c) return;
        patchChar(c.id, { tags: [...new Set([...(c.tags || []), t])] });
        tag = "";
    }
    function addUrl() {
        const u = url.trim(),
            c = v?.c;
        if (!/^https?:\/\//.test(u) || !c) return;
        patchChar(c.id, { image: u, imageData: "", images: [...new Set([...(c.images || []), c.image, u].filter((x): x is string => !!x))] }, "Change picture");
        url = "";
    }
</script>

{#if v && v.c}
    {@const { m, c } = v}
    {@const img = charImg(c)}
    {@const gal = charGallery(c)}
    {@const at = Math.max(0, gal.findIndex(g => g.u === img))}
    <div class="catalog charcat"><div class="navarrows"><button class="x" data-act="close">Close ✕</button></div>
        <div class="left"><div class="charbig">{#if img}<button class="cview" data-act="char-view" data-k={at} title="View" onclick={() => store.dialog({ view: at })}><Pic src={img} /></button>{:else}<span class="noimg">{c.name.charAt(0)}</span>{/if}</div>
            <div class="callcard"><span>Rank</span><input class="inp" id="ch-rank" inputmode="numeric" bind:value={rank} style="width:60px;padding:2px 6px"></div></div>
        <div style="min-width:0"><div class="eyebrow">♟ Character{c.va ? " · " + ((c.media || []).some(x => ["tv", "film"].includes(String(x.medium))) ? "played by " : "voiced by ") + c.va : ""}{c.age ? " · " + c.age : ""}</div>
            <!-- svelte-ignore a11y_missing_content: the heading is the name's box -->
            <h2><input class="h2in" id="ch-name" bind:value={name} aria-label="Name"></h2>{#if c.native}<div class="alt">{c.native}</div>{/if}
            <div class="sec" style="margin-top:12px"><p class="label">From</p><div class="bar">{#each c.media as x, i}{#if x.id && store.items.has(x.id)}<button class="chip" data-act="open" data-id={x.id}>{x.title}</button>{:else}<span class="chip ghostchip">{x.title}<button class="linkbtn" data-act="char-unfrom" data-k={i} aria-label="Remove">✕</button></span>{/if}{/each}
                <input class="inp" id="ch-from" list="ch-opts" placeholder="Also appears in…" style="max-width:220px" bind:value={from}><datalist id="ch-opts">{#each opts as o}<option value={o}></option>{/each}</datalist><button class="btn sm" data-act="char-from" onclick={addFrom}>Add</button></div></div>
            <div class="sec"><p class="label">Group</p><div class="status-seg wrap">{#each CHAR_GROUPS as g}<button data-act="char-group" data-k={g} aria-pressed={charGroup(c) === g}>{g}</button>{/each}</div></div>
            <div class="sec"><p class="label">Why they're a favourite</p><textarea id="ch-why" placeholder="What draws you to them: the way they think, how they treat people, the arc…" bind:value={why}></textarea></div>
            <div class="sec"><p class="label">Traits</p><div class="tagedit">{#each c.tags as t, i}<span class="tag">{t}<button data-act="char-untag" data-k={i} aria-label="Remove {t}">✕</button></span>{/each}<input class="inp" id="ch-tag" list="ch-tags" placeholder="e.g. genius, older-sister energy, morally grey" bind:value={tag} onkeydown={addTag}><datalist id="ch-tags">{#each otherTags as t}<option value={t}></option>{/each}</datalist></div></div>
            <div class="sec"><p class="label">Pictures · {gal.length}</p><div class="cgal">{#each gal as g, i}<div class="cgi{img === g.u ? ' on' : ''}"><button class="cgb" data-act="char-pic" data-k={i} title="Use this one">{#if /^data:|^https?:/.test(g.u)}<Pic src={g.u} loading="lazy" />{/if}</button><span class="cgk">{g.k === "original" ? "original" : g.k === "upload" ? "yours" : "link"}</span>{#if g.k !== "original"}<button class="cgx" data-act="char-pic-del" data-k={i} aria-label="Remove">✕</button>{/if}</div>{/each}
                <button class="cgi add" data-act="char-upload" title="Upload pictures or GIFs">＋</button></div>
                <div class="bar"><input class="inp" id="ch-url" placeholder="Add a picture from a link" style="max-width:260px" bind:value={url}><button class="btn sm" data-act="char-url" onclick={addUrl}>Add</button>{#if img}<button class="btn sm" data-act="frame-open" data-src={img} data-k={JSON.stringify({ t: "char", id: c.id })}>Adjust</button><button class="btn sm ghost" data-act="char-view" data-k={at} onclick={() => store.dialog({ view: at })}>View</button>{/if}</div><p class="hint">Keep as many as you like (GIFs too) and switch between them; the original from {c.src === "anilist" ? "AniList" : "its source"} always stays. You can also paste an image while this is open.</p></div>
            {#if c.about}<div class="sec"><p class="label">About (spoilers removed)</p><p class="hint" style="white-space:pre-wrap">{c.about}</p></div>{/if}
            <div class="bar" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line)"><button class="btn gold" data-act="char-save" onclick={save}>Save</button><span class="spacer"></span>
                {#if m.view != null}<CharViewer {gal} at={m.view} />{/if}{#if m.confirmDelete}<span class="err">Remove?</span><button class="btn danger" data-act="char-del-yes">Remove</button><button class="btn ghost" data-act="char-del-no" onclick={() => store.dialog({ confirmDelete: false })}>Keep</button>{:else}<button class="btn danger" data-act="char-del" onclick={() => store.dialog({ confirmDelete: true })}>Remove</button>{/if}</div></div></div>
{:else if v}
    <DialogHead title="Character" /><p class="hint">This character was removed.</p>
{/if}
