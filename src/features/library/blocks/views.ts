// src/features/library/blocks/views.ts
// ─────────────────────────────────────────────────────────────────
//  The overview's blocks, each by its component (what each one is: BLOCKS in blocks.ts; a block that's a chart has
//  no component of its own, ChartBlock.svelte draws it). Adding a block is a line in BLOCKS and a line here.
// ─────────────────────────────────────────────────────────────────

import type { Component } from "svelte";
import type { OvBlock } from "../blocks";
import Activity from "./Activity.svelte";
import Airing from "./Airing.svelte";
import Bio from "./Bio.svelte";
import Chars from "./Chars.svelte";
import Discover from "./Discover.svelte";
import Favs from "./Favs.svelte";
import Health from "./Health.svelte";
import Lists from "./Lists.svelte";
import NextUp from "./NextUp.svelte";
import Progress from "./Progress.svelte";
import Queue from "./Queue.svelte";
import QuickLog from "./QuickLog.svelte";
import Quote from "./Quote.svelte";
import Recent from "./Recent.svelte";
import Revisits from "./Revisits.svelte";
import Shelves from "./Shelves.svelte";
import Summary from "./Summary.svelte";
import Year from "./Year.svelte";
import ModeBlock from "./ModeBlock.svelte";
import LearnMini from "../../learning-centre/pages/LearnMini.svelte";
import PathsMini from "../../learning-centre/pages/PathsMini.svelte";
import CurriculaMini from "../../learning-centre/pages/CurriculaMini.svelte";

const lc = (C: Component) => C as unknown as Component<{ c: OvBlock }>; // cast: a Learning Centre block needs nothing it's given (it reads the store)

export const OV_VIEWS: Record<string, Component<{ c: OvBlock }>> = {
    summary: Summary,
    bio: Bio,
    favs: Favs,
    chars: Chars,
    progress: Progress,
    airing: Airing,
    queue: Queue,
    nextup: NextUp,
    quicklog: QuickLog,
    recent: Recent,
    shelves: Shelves,
    activity: Activity,
    lists: Lists,
    health: Health,
    revisits: Revisits,
    year: Year,
    seasonal: ModeBlock,
    diary: ModeBlock,
    playing: ModeBlock,
    series: ModeBlock,
    quote: Quote,
    discover: Discover,
    learn: lc(LearnMini),
    paths: lc(PathsMini),
    courses: lc(CurriculaMini),
};
