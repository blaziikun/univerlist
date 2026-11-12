// src/features/core/test-hook.ts
// ─────────────────────────────────────────────────────────────────
//  The test hook: window.__ulTest, the one way the browser tests reach into the page
//
//  The browser tests (tests/e2e, tests/stress) and extensions' own test suites call the older code inside
//  page.evaluate (__ulTest.extGet, __ulTest.items, __ulTest.goSettings…). This puts those names on one object, each
//  read live from its module, so a `let` such as KEYS always shows its current value. Only names a test uses are here.
//  Two can be replaced with a stand-in, as the tests do (extCall, renderMain); the rest are read only. Its type,
//  TestHook, is what the tests see as the global __ulTest (tests/hook.d.ts), so a name the tests use that no longer
//  exists is a type error.
//
//  Only in the builds the browser tests run (pnpm build:e2e, Vite's modes e2e and file-e2e). start.ts installs it only
//  when __UL_TEST_HOOK__, a constant Vite writes in as it builds, is true; in the site's build and the one-file build
//  people download it's false, so the call goes and this module with it (tools/no-test-hook.ts checks the built files).
// ─────────────────────────────────────────────────────────────────

import { isBooted } from "./events";
import { syncNow } from "../account/sync";
import { extCall, replaceExtCall } from "../extensions/extensions";
import { renderMain, replaceRenderMain } from "./shell";
import * as core from "./core";
import * as theme from "./theme";
import * as sources from "../sources/sources";
import * as igdb from "../sources/igdb";
import * as proxy from "../sources/proxy";
import * as lbimport from "../sources/lbimport";
import * as anilist from "../sources/anilist";
import * as covers from "../sources/covers";
import * as views from "./views";
import * as types from "./types";
import * as parts from "./parts";
import * as shell from "./shell";
import * as library from "../library/library";
import * as blocks from "../library/blocks";
import * as settings from "../settings/settings";
import * as modals from "./modals";
import * as frame from "../library/frame";
import * as importers from "../import-export/importers";
import * as smartimport from "../import-export/smartimport";
import * as packs from "../import-export/packs";
import * as exportZip from "../import-export/export-zip";
import * as modePages from "../insights/mode-pages";
import * as learning from "../learning-centre/learning";
import * as learningCurricula from "../learning-centre/learning-curricula";
import * as learningHub from "../learning-centre/learning-hub";
import * as ambience from "../look/ambience";
import * as ownSources from "../watch-read/own-sources";
import * as watch from "../watch-read/watch";
import * as series from "../watch-read/series";
import * as builtins from "../extensions/builtins";
import * as read from "../watch-read/read";
import * as readlibs from "../watch-read/readlibs";
import * as stage from "../watch-read/stage";
import * as tiers from "../library/tiers";
import * as search from "./search";
import * as keys from "./keys";
import * as tabs from "./tabs";
import * as extensions from "../extensions/extensions";
import * as navigation from "./navigation";
import * as itemActions from "../library/item-actions";
import * as actions from "./actions";

/** one module's names on the hook. `const` keeps each name a literal, so TestHook knows it, and a name the module
 *  doesn't export is a type error */
const part = <M extends object, const K extends readonly (keyof M & string)[]>(mod: M, names: K) => ({ mod, names });

const PARTS = [
    part(core, [
        "APP_NAME",
        "DONATE_URL",
        "KEYS",
        "MEDIA",
        "addItem",
        "allModes",
        "change",
        "changeMeta",
        "clone",
        "curMode",
        "exportCSV",
        "fileSync",
        "findSibling",
        "flushSave",
        "fmtScore",
        "idbAll",
        "idbGet",
        "inMode",
        "items",
        "linkItems",
        "markDirty",
        "meta",
        "migrateItem",
        "migratePaths",
        "migrateV10",
        "minutesSpent",
        "modeById",
        "newId",
        "nowISO",
        "patch",
        "quietPatch",
        "saveKeys",
        "shelvesOf",
        "spaceModes",
        "statusWord",
        "titleOf",
        "tx",
        "ui",
        "undo",
        "vault",
    ]),
    part(theme, ["modeTheme", "resolveTheme"]),
    part(sources, ["allArt", "candidateDetails", "castSplit", "searchMedium", "tmdbSearch"]),
    part(igdb, ["IGDB_ON", "igdbQ"]),
    part(proxy, ["SPN", "TMDB_ON", "hcCovers", "siteShares", "spinesUpdate"]),
    part(lbimport, ["LB", "lbStore"]),
    part(anilist, ["alSync", "ensureTag", "renderAlStatus"]),
    part(covers, ["auto", "renderAutoStatus", "scoreQ"]),
    part(views, ["all", "dupGroups", "modeItems", "rankPool", "rankState", "sortBy", "viewOpts"]),
    part(types, ["moveToMode"]),
    part(parts, ["combineItems", "partsOf", "seasonFront", "splitPart"]),
    part(shell, ["renderSide", "renderTop", "updateBusy"]),
    part(library, ["FILT_EMPTY", "libraryList", "listOrder"]),
    part(blocks, ["BLOCKS", "blocksOf", "setBlocks"]),
    part(settings, ["editThemeId", "setSecs", "themeList"]),
    part(modals, ["closeModal", "openModal", "renderOverlay"]),
    part(frame, ["openFrame"]),
    part(importers, ["ZIP_LIMITS", "readImportFile", "restoreImages", "zipFiles"]),
    part(smartimport, ["columnScale", "mediumFromText", "parseAnyScore", "titleLike"]),
    part(packs, ["applyParts"]),
    part(exportZip, ["bytesToData", "pictureType", "v2Files"]),
    part(modePages, ["seasonState"]),
    part(learning, [
        "ACS",
        "PWS",
        "lcMod",
        "lcNewPath",
        "lcSub",
        "pwBucket",
        "pwCur",
        "pwSetState",
        "pwStages",
        "pwState",
    ]),
    part(learningCurricula, ["curS", "curSid", "uniAddProgramme"]),
    part(learningHub, ["lcMastery", "lcStripPersonal", "lcTopicWaits"]),
    part(ambience, ["ambApply"]),
    part(ownSources, ["isOwnSource"]),
    part(watch, [
        "PS",
        "W",
        "WP",
        "cinSideRedraw",
        "epHasSource",
        "epWatched",
        "playerRedraw",
        "posKey",
        "renderPlayer",
        "savePos",
        "sourcesFor",
        "srvRefresh",
        "watchFromItem",
        "watchOpen",
        "watchStart",
        "watchStep",
    ]),
    part(series, ["ssKey", "ssList"]),
    part(builtins, ["builtinOn", "builtinSet", "stageOn"]),
    part(read, ["RD", "RS", "rdSet", "readFromItem", "readStart", "readStep", "readerDrop", "renderReader"]),
    part(readlibs, ["RLS", "readRemote"]),
    part(stage, ["STAGE_BLACK", "mergeWatchResults", "seasonsAcrossLibrary", "stageLook"]),
    part(tiers, ["newTierList", "tierSel"]),
    part(search, ["GS", "closeSearch", "focusSearch", "gsLocal"]),
    part(keys, ["closeCtx", "goWatch", "openCtx", "openMenu"]),
    part(tabs, ["tabsFor"]),
    part(extensions, [
        "EXT",
        "extDB",
        "extExportFiles",
        "extGet",
        "extInstall",
        "extNetFetch",
        "extRestore",
        "extSave",
        "extStop",
        "extWatchSources",
    ]),
    part(navigation, [
        "closeSettings",
        "goList",
        "goSettings",
        "goTab",
        "openAdd",
        "openDiscover",
        "render",
        "setMode",
        "togglePrivate",
    ]),
    part(itemActions, ["createList", "listAdd", "lockVault", "newListId", "openItem"]),
    part(actions, ["actOn", "handleImportFile"]),
];

type Part = (typeof PARTS)[number];
type Names<P> = P extends { mod: infer M; names: readonly (infer K)[] } ? Pick<M, K & keyof M> : never;
/** every part's names in one type (a union of parts made one intersection) */
type All<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;

export type TestHook = Readonly<All<Names<Part>>> & {
    /** the app's own start-up has finished (core/events.ts): the tests wait for it */
    readonly booted: boolean;
    /** Account & sync: sync right now (the account tests) */
    readonly syncNow: () => Promise<void>;
    /** the two a test can put a stand-in in the place of */
    extCall: typeof extCall;
    renderMain: typeof renderMain;
};

/** the names of one module, each a getter that reads the module's export when it's asked for */
function expose(hook: object, mod: Readonly<Record<string, unknown>>, names: readonly string[]) {
    for (const name of names)
        Object.defineProperty(hook, name, { get: () => mod[name], enumerable: true, configurable: true });
}

/** puts window.__ulTest on the page (start.ts, test builds only) */
export function installTestHook(): void {
    const hook = {};
    for (const p of PARTS) expose(hook, p.mod, p.names);
    Object.defineProperties(hook, {
        booted: { get: isBooted, enumerable: true },
        syncNow: { value: () => syncNow().then(() => {}), enumerable: true },
        // what a test hands in is only taken if it's a function (an extension's suite is plain JavaScript)
        extCall: {
            get: () => extCall, // an import is live: after a stand-in is put in, this is the stand-in
            set: (v: unknown) => {
                if (typeof v === "function")
                    replaceExtCall(async (...args) => {
                        const answer: unknown = await Reflect.apply(v, undefined, args);
                        return answer;
                    });
            },
            enumerable: true,
        },
        renderMain: {
            get: () => renderMain,
            set: (v: unknown) => {
                if (typeof v === "function") replaceRenderMain(() => void Reflect.apply(v, undefined, []));
            },
            enumerable: true,
        },
    });
    Object.defineProperty(window, "__ulTest", { value: hook, enumerable: false });
}
