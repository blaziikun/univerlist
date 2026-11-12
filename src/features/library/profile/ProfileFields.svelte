<!--
    src/features/library/profile/ProfileFields.svelte
    ─────────────────────────────────────────────────────────────────
      Edit profile's boxes, for one profile (yours everywhere, or a mode's own): name, picture link, bio, the banners to
      pick from and a banner link. What's typed is this one's own, so picking a banner or uploading a picture doesn't
      wipe it; a box only changes from outside when what it shows does (Remove picture empties the link).
      Save and "Use link" use what's typed; the other buttons change the profile at once (library/profile-handlers.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { untrack } from "svelte";
    import { store } from "../../core/store.svelte";
    import { changeMeta, meta, modeById, present, titleOf, toast } from "../../core/core";
    import { closeModal } from "../../core/modals";
    import { render } from "../../core/navigation";
    import { favPos, modeItems } from "../../core/views";
    import { hasAnimanga } from "../../core/shell";
    import { modeChanged } from "../../settings/handlers";
    import { caretAtStart } from "../../core/dialog/caret";
    import Pic from "../../core/dialog/Pic.svelte";

    let { mode: id }: { mode: string } = $props();

    const v = $derived.by(() => {
        void store.items;
        const mode = modeById(id),
            uni = mode.id === "universal",
            p = { ...store.meta.profile },
            al = { ...(p.anilist || {}) },
            mp = { ...(mode.profile || {}) };
        const banners = modeItems(mode)
            .filter(b => b.banner)
            .sort((a, b) => favPos(a.id) - favPos(b.id) || (b.rating || 0) - (a.rating || 0))
            .slice(0, 18);
        const avatar = uni ? p.avatarData || p.avatar || al.avatar : mp.avatarData || mp.avatar,
            banner = uni ? p.bannerData || p.banner || al.banner : mp.bannerData || mp.banner;
        return {
            name: mode.name,
            uni,
            main: p.name || "",
            alAvatar: !!al.avatar,
            saved: {
                name: (uni ? p.name : mp.name || p.name) || "",
                avatar: (uni ? p.avatar : mp.avatar) || "",
                bio: (uni ? p.bio : mp.bio) || "",
            },
            cur: uni ? (p.bannerData ? "" : p.banner || al.banner) : mp.bannerData ? "" : mp.banner,
            avatar: avatar || "",
            banner: banner || "",
            ownBanner: !!(uni ? p.banner || p.bannerData : mp.banner || mp.bannerData),
            pics: [al.banner && hasAnimanga(mode) ? { u: al.banner, l: "AniList banner" } : null, ...banners.map(b => ({ u: b.banner || "", l: titleOf(b) }))].filter(present),
        };
    });
    const at = untrack(() => v.saved);
    let name = $state(at.name),
        avatar = $state(at.avatar),
        bio = $state(at.bio),
        link = $state("");
    // a box follows what it shows when that changes from outside (Remove picture), and keeps what's typed otherwise
    let was = at;
    $effect(() => {
        const s = v.saved;
        untrack(() => {
            if (s.name !== was.name) name = s.name;
            if (s.avatar !== was.avatar) avatar = s.avatar;
            if (s.bio !== was.bio) bio = s.bio;
            was = s;
        });
    });
    function save() {
        const mode = modeById(id),
            nm = name.trim(),
            av = avatar.trim(),
            about = bio.trim();
        if (mode.id === "universal") changeMeta("Edit profile", "profile", p => ({ ...p, name: nm, avatar: av, bio: about }));
        else {
            if (!meta.profile.name && nm) meta.profile.name = nm;
            mode.profile = { ...(mode.profile || {}), name: nm && nm !== meta.profile.name ? nm : "", bio: about, avatar: av };
            modeChanged();
        }
        closeModal();
        render();
    }
    function useLink() {
        const mode = modeById(id),
            url = link.trim();
        if (!/^https?:\/\//.test(url)) {
            toast("Paste a link that starts with https://");
            return;
        }
        if (mode.id === "universal") changeMeta("Change banner", "profile", p => ({ ...p, banner: url, bannerData: "" }));
        else {
            mode.profile = { ...(mode.profile || {}), banner: url, bannerData: "", noBanner: undefined };
            modeChanged();
        }
    }
    const frame = (t: string) => JSON.stringify({ t, mode: id });
    const inMode = $derived(v.uni ? "" : " in " + v.name);
</script>

<!-- svelte-ignore a11y_autofocus: your name is where you start -->
<div class="fields"><div class="field"><label for="pe-name">{v.uni ? "Your name" : "Name in " + v.name}</label><input id="pe-name" bind:value={name} placeholder={v.uni ? "" : "Uses your main name: " + v.main} autofocus use:caretAtStart></div>
    <div class="field"><label for="pe-avatar">Picture{inMode} (link)</label><input id="pe-avatar" bind:value={avatar} placeholder={v.uni ? (v.alAvatar ? "Using your AniList picture" : "https://…") : "Uses your main picture"}></div>
    <div class="field full"><label for="pe-bio">About you{inMode}</label><textarea id="pe-bio" placeholder={v.uni ? "" : "Leave empty to use your main bio"} bind:value={bio}></textarea></div></div>
<div class="bar"><button class="btn sm" data-act="pe-avatar-upload">Upload a picture</button>{#if v.avatar}<button class="btn sm" data-act="frame-open" data-src={v.avatar} data-k={frame("avatar")}>Adjust</button><button class="btn sm ghost" data-act="pe-avatar-clear">Remove picture</button>{/if}<span class="hint">Each mode can have its own name, picture, banner and bio. Leave one empty to use your main one.</span></div>
<div class="sec"><p class="label">Banner{inMode}</p><div class="covergrid">{#each v.pics as x}<button class="cg wide{v.cur === x.u ? ' on' : ''}" data-act="pe-banner" data-url={x.u}><Pic src={x.u} loading="lazy" /><span>{x.l}</span></button>{:else}<p class="hint">Banners from AniList and your favourites appear here.</p>{/each}</div>
    <div class="bar"><button class="btn sm" data-act="pe-banner-upload">Upload a banner</button>{#if v.banner}<button class="btn sm" data-act="frame-open" data-src={v.banner} data-k={frame("banner")}>Adjust</button>{/if}<input class="inp" id="pe-banner-url" placeholder="…or paste an image link" style="max-width:240px" bind:value={link}><button class="btn sm" data-act="pe-banner-link" onclick={useLink}>Use link</button>{#if v.ownBanner}<button class="btn sm ghost" data-act="pe-banner-clear">{v.uni ? "Remove banner" : "Use the main banner"}</button>{/if}{#if !v.uni}<button class="btn sm ghost" data-act="pe-banner-none">No banner here</button>{/if}</div>
    <p class="hint">Animated GIFs work for the picture and the banner.</p></div>
<div class="bar"><button class="btn gold" data-act="pe-save" onclick={save}>Save</button></div>
