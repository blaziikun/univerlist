// src/features/core/start.ts
// ─────────────────────────────────────────────────────────────────
//  Start: the older modules' start-up, in a fixed order
//
//  The older modules in src/features import each other in one big circle, so the order they load in says little. As it
//  loads, each one only declares its functions and tables; what it does at start-up (listeners, timers, the dialogs and
//  blocks it adds, and last of all the app itself, in core/events.ts) is in its init…() function. They run here, once,
//  in the order the app has always started in. main.ts imports this before anything else.
// ─────────────────────────────────────────────────────────────────

import { installTestHook } from "./test-hook";
import { initCore } from "./core";
import { initTheme } from "./theme";
import { initLbimport } from "../sources/lbimport";
import { initAnilist } from "../sources/anilist";
import { initBoxArt } from "../sources/box-art";
import { initShell } from "./shell";
import { initStatblocks } from "../library/statblocks";
import { initCustomStats } from "../library/custom-stats";
import { initSettings } from "../settings/settings";
import { initModals } from "./modals";
import { initFrame } from "../library/frame";
import { initExportDialog } from "../import-export/export-dialog";
import { initLearning } from "../learning-centre/learning";
import { initLearningCurricula } from "../learning-centre/learning-curricula";
import { initAmbience } from "../look/ambience";
import { initBuiltins } from "../extensions/builtins";
import { initKeys } from "./keys";
import { initTabs } from "./tabs";
import { initExtensions } from "../extensions/extensions";
import { initGuide } from "../settings/guide";
import { initItemActions } from "../library/item-actions";
import { initActions } from "./actions";
import { initEvents } from "./events";

// the browser tests' way into the page (window.__ulTest), in the builds they run only: __UL_TEST_HOOK__ is false in
// every other build, so this call and the whole hook are left out of it (core/test-hook.ts)
if (__UL_TEST_HOOK__) installTestHook();
initCore();
initTheme();
initLbimport();
initAnilist();
initBoxArt();
initShell();
initStatblocks();
initCustomStats();
initSettings();
initModals();
initFrame();
initExportDialog();
initLearning();
initLearningCurricula();
initAmbience();
initBuiltins();
initKeys();
initTabs();
initExtensions();
initGuide();
initItemActions();
initActions();
initEvents();
