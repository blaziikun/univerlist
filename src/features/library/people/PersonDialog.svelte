<!--
    src/features/library/people/PersonDialog.svelte
    ─────────────────────────────────────────────────────────────────
      A person: their picture, name, roles (any number), what they worked on that's in your library, and why you like
      their work; a favourite, or forgotten. Opened by "open-person" and "person-add" (with no name yet).
      The dialog follows the person by the name it has (ui.modal.name), which changes when you rename them. What you
      type is this one's: the roles, credits and favourite are saved at once, everything else with Save.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { caretAtStart } from "../../core/dialog/caret";
    import { store } from "../../core/store.svelte";
    import { $ as one, changeMeta, entryOf, MEDIA, modeById, norm, titleOf, toast } from "../../core/core";
    import { all } from "../../core/views";
    import { idFromOption } from "../../core/navigation";
    import { setPendingCover } from "../../core/events";
    import Pic from "../../core/dialog/Pic.svelte";
    import Card from "../tiles/Card.svelte";
    import { peopleIndex, ROLE_LIST } from "../connect";
    import { savePerson } from "../item-actions";
    import type { FavPerson } from "../../core/model";

    const v = $derived.by(() => {
        void store.items;
        const m = store.ui.modal;
        if (!m || m.kind !== "person") return null;
        const who = norm(m.name || ""),
            P = peopleIndex(modeById("universal")).find(p => norm(p.name) === who),
            s: FavPerson = (store.meta.people || []).find(p => norm(p.name) === who) || { name: "" };
        return {
            m: { ...m },
            s: { ...s },
            roles: new Set([...(s.roles || (s.role ? [s.role] : [])), ...(P ? P.roles : [])]),
            credits: P ? [...new Set(P.credits.map(c => c.id))].filter(id => store.items.has(id)) : [],
        };
    });
    const opened = store.ui.modal,
        was = (store.meta.people || []).find(p => norm(p.name) === norm(opened?.name || ""));
    let name = $state(opened?.name || ""),
        image = $state(was?.image || ""),
        why = $state(was?.why || ""),
        role = $state(""),
        credit = $state(""),
        creditRole = $state("Actor");
    const opts = $derived(
        all()
            .sort((a, b) => titleOf(a).localeCompare(titleOf(b)))
            .map(x => `${titleOf(x)} · ${MEDIA[x.medium].one}`)
    );

    /** the name typed, or a nudge to type one first */
    function named() {
        const n = name.trim();
        if (!n) toast("Give them a name first.");
        return n;
    }
    function follow(n: string) {
        store.dialog({ name: n });
    }
    function toggleRole(r: string, on?: boolean) {
        const n = named();
        if (!n || !r) return;
        savePerson(n, p => ({ ...p, roles: on === undefined && (p.roles || []).includes(r) ? (p.roles || []).filter(x => x !== r) : [...new Set([...(p.roles || []), r])] }), "Edit roles");
        follow(n);
    }
    function addRole() {
        const r = role.trim();
        if (!named() || !r) return;
        toggleRole(r, true);
        role = "";
    }
    function addCredit() {
        const n = name.trim(),
            cid = idFromOption(credit);
        if (!n || !cid) {
            toast("Pick something from the list.");
            return;
        }
        const r = creditRole;
        savePerson(n, p => ({ ...p, roles: [...new Set([...(p.roles || []), r])], credits: [...(p.credits || []).filter(c => !(c.id === cid && c.role === r)), { id: cid, role: r }] }), "Add credit");
        follow(n);
        credit = "";
    }
    function fav() {
        const n = name.trim();
        if (!n) return;
        savePerson(n, p => ({ ...p, fav: !p.fav }), "Favourite person");
        follow(n);
    }
    function save() {
        const n = named();
        if (!n) return;
        const old = (store.meta.people || []).find(p => norm(p.name) === norm(v?.m.name || ""));
        if (old && norm(old.name) !== norm(n)) changeMeta("Rename person", "people", L => L.map(p => (p.id === old.id ? { ...p, name: n } : p)));
        savePerson(n, p => ({ ...p, image: image.trim() || p.image, why: why.trim() }), "Edit person");
        follow(n);
        toast("Saved");
    }
    function upload() {
        const n = named();
        if (!n) return;
        follow(n);
        setPendingCover("person");
        one("#file-cover")?.click();
    }
</script>

{#if v}
    {@const { m, s } = v}
    {@const img = s.imageData || s.image || ""}
    <div class="catalog charcat"><div class="navarrows"><button class="x" data-act="close">Close ✕</button></div>
        <div class="left"><div class="charbig">{#if img}<Pic src={img} />{:else}<span class="noimg">{(m.name || "?").charAt(0)}</span>{/if}</div>
            <div class="bar"><button class="btn sm" data-act="pp-upload" onclick={upload}>Upload</button></div><input class="inp" id="pp-img" bind:value={image} placeholder="Picture link"></div>
        <div style="min-width:0"><div class="eyebrow">Person</div>
            <!-- svelte-ignore a11y_autofocus, a11y_missing_content: a new person starts with their name; the heading is the box -->
            <h2><input class="h2in" id="pp-name" bind:value={name} use:caretAtStart placeholder="Name" aria-label="Name" autofocus={!m.name}></h2>
            <div class="sec"><p class="label">Roles</p><div class="chips">{#each ROLE_LIST as r}<button class="chip" data-act="pp-role" data-k={r} aria-pressed={v.roles.has(r)} onclick={() => toggleRole(r)}>{r}</button>{/each}</div>
                <div class="bar" style="margin-top:6px"><input class="inp" id="pp-role-new" placeholder="Another role" style="max-width:200px" bind:value={role} onkeydown={e => { if (e.key === "Enter") { e.preventDefault(); addRole(); } }}><button class="btn sm" data-act="pp-role-add" onclick={addRole}>Add role</button></div></div>
            <div class="sec"><p class="label">Credits in your library · {v.credits.length}</p>{#if v.credits.length}<div class="strip">{#each v.credits.slice(0, 40) as id (id)}{@const b = entryOf(id)}{#if b}<Card {b} />{/if}{/each}</div>{:else}<p class="hint">Nothing yet.</p>{/if}
                <div class="bar" style="margin-top:6px"><input class="inp" id="pp-credit" list="pp-opts" placeholder="Also worked on…" style="max-width:260px" bind:value={credit}><datalist id="pp-opts">{#each opts as o}<option value={o}></option>{/each}</datalist><select class="sel" id="pp-credit-role" onchange={e => (creditRole = e.currentTarget.value)}>{#each ROLE_LIST as r}<option value={r} selected={r === creditRole}>{r}</option>{/each}</select><button class="btn sm" data-act="pp-credit-add" onclick={addCredit}>Add credit</button></div></div>
            <div class="sec"><p class="label">Why you like their work</p><textarea id="pp-why" bind:value={why}></textarea></div>
            <div class="bar" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line)"><button class="btn gold" data-act="pp-save" onclick={save}>Save</button><button class="btn{s.fav ? ' favon' : ''}" data-act="pp-fav" onclick={fav}>{s.fav ? "♥ Favourite" : "♡ Favourite"}</button>
                <span class="spacer"></span>{#if s.id}<button class="btn danger" data-act="person-remove" data-k={s.id}>Forget</button>{/if}</div></div></div>
{/if}
