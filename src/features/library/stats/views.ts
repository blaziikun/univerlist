// src/features/library/stats/views.ts
// ─────────────────────────────────────────────────────────────────
//  The stats page's blocks that aren't a chart of rows, each by its component (the rest are drawn by
//  blocks/ChartBlock.svelte from what they say they show: STAT_BLOCKS in statblocks.ts).
// ─────────────────────────────────────────────────────────────────

import type { Component } from "svelte";
import type { StBlock } from "../statblocks";
import StatBlock from "./StatBlock.svelte";

export const ST_VIEWS: Record<string, Component<{ c: StBlock }>> = {
    tiles: StatBlock,
    month: StatBlock,
    hours: StatBlock,
    heat: StatBlock,
    loved: StatBlock,
    crowd: StatBlock,
};
