<!--
    src/features/core/shell/ProfileHead.svelte
    ─────────────────────────────────────────────────────────────────
      The profile header above a mode's tabs: the banner, your picture and name (or a way to add it), the mode with its
      menu (ModeList), Edit profile, and the mode's tabs (TabsBar). What it shows comes from profileView() in
      core/shell.ts; it's drawn again with the page (renderMain), and when the mode menu opens or closes. The buttons go
      through profile-edit, mode-menu and the tabs' own.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../store.svelte";
    import { profileView } from "../shell";
    import { shellNews } from "./shell-state.svelte";
    import Avatar from "./Avatar.svelte";
    import ModeList from "./ModeList.svelte";
    import TabsBar from "./TabsBar.svelte";

    const v = $derived.by(() => {
        void store.ui;
        void shellNews.side;
        return profileView();
    });
</script>

<div class="prof">{" "}
    <div class="pbanner{v.banner ? '' : ' none'}" style={v.banner}><div class="pshade"></div>
      <div class="phead"><button class="pavedit" data-act="profile-edit" data-k={v.id} title="Change picture, banner and bio" aria-label="Edit profile"><Avatar mp={v.mp} size={96} cls="avatar" /><span class="pencil" aria-hidden="true">✎</span></button>
        <div class="pname"><h2>{#if v.name}{v.name}{:else}<button class="linkbtn addname" data-act="profile-edit" data-k={v.id}>Add your name</button>{/if}</h2>
          <div class="modepick pmode"><button class="modebtn pmodebtn" data-act="mode-menu" aria-expanded={v.menu} aria-haspopup="menu" title="Switch mode" style={v.mc}><span class="mg">{v.g}</span> {v.mode} <span class="ct">· {v.n}</span><span class="car">▾</span></button>{#if v.menu}<ModeList />{/if}</div></div>
        <span class="spacer"></span><button class="btn sm ghost pedit" data-act="profile-edit" data-k={v.id} title={v.editTitle}>✎ Edit profile</button></div></div>
    <TabsBar tabs={v.tabs} title={v.tabTitle} />{" "}
  </div>
