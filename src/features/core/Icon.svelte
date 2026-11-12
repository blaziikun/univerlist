<!--
    src/features/core/Icon.svelte
    ─────────────────────────────────────────────────────────────────
      One of the app's own icons (ICON in shell.ts), by name. The icons are fixed SVG written in this repo, never
      anything from outside, and this is the one place they're put into the page: a name that isn't in the table is
      a type error, so nothing else can be inserted here. It draws the <svg> alone, with no wrapper, exactly as the
      HTML pages put it in.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { ICON, type IconName } from "./shell";

    let { name }: { name: IconName } = $props();
</script>

{@html ICON[name]}
