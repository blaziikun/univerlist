<!--
    src/features/core/shell/ProfilePage.svelte
    ─────────────────────────────────────────────────────────────────
      A mode's page: the profile header (ProfileHead), then the tab you're on, in its frame (.tabbody, marked
      data-svelte as the frame a tab is drawn in). Each tab is its own component (core/pages.ts lists them, and hands
      them in); a tab is drawn afresh when you move to another one, and catches up through the store otherwise.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { Component } from "svelte";
    import { store } from "../store.svelte";
    import HiddenNote from "../page/HiddenNote.svelte";
    import ProfileHead from "./ProfileHead.svelte";

    let { tabs }: { tabs: Record<string, Component> } = $props();

    const tab = $derived(store.ui.tab);
    const Tab = $derived(Object.hasOwn(tabs, tab) ? tabs[tab] : null);
</script>

<ProfileHead />{#key tab}<div class="tabbody t-{tab}" data-svelte>{#if Tab}<Tab />{:else}<HiddenNote />{/if}</div>{/key}
