// src/features/core/dialogs.ts
// ─────────────────────────────────────────────────────────────────
//  The dialogs drawn by Svelte
//
//  The older overlay code (core/modals.ts renderOverlay) still opens and closes every dialog, and draws the frame
//  around it (the scrim, and the box with role="dialog"). For a dialog listed here it hands that box to the component
//  the first time, and from then on only asks it to catch up with the store: the component keeps its own DOM, so what
//  you're typing, where focus is and where you've scrolled to all stay put. closeModal() lets it go.
//  Moving another dialog to Svelte is one line here (its kind, as openModal() names it, and its component).
// ─────────────────────────────────────────────────────────────────

import { type Component, flushSync, mount, unmount } from "svelte";
import AddDialog from "../library/add/AddDialog.svelte";
import ColumnMatch from "../import-export/ColumnMatch.svelte";
import ExportDialog from "../import-export/ExportDialog.svelte";
import ImportDialog from "../import-export/ImportDialog.svelte";
import PasteList from "../import-export/PasteList.svelte";
import SmartMatch from "../import-export/SmartMatch.svelte";
import ChooseCovers from "../sources/dialogs/ChooseCovers.svelte";
import RefreshArt from "../sources/dialogs/RefreshArt.svelte";
import ItemCard from "../library/card/ItemCard.svelte";
import CastToList from "../library/lists/CastToList.svelte";
import ListPick from "../library/lists/ListPick.svelte";
import NewList from "../library/lists/NewList.svelte";
import PickItems from "../library/lists/PickItems.svelte";
import AddCharacter from "../library/people/AddCharacter.svelte";
import CharacterDialog from "../library/people/CharacterDialog.svelte";
import FavouriteEdit from "../library/people/FavouriteEdit.svelte";
import PersonDialog from "../library/people/PersonDialog.svelte";
import TierPick from "../library/lists/TierPick.svelte";
import PickForMe from "../insights/pick/PickForMe.svelte";
import DiscoverDialog from "../insights/discover/DiscoverDialog.svelte";
import NewCourse from "../learning-centre/dialogs/NewCourse.svelte";
import Reading from "../learning-centre/dialogs/Reading.svelte";
import FetchFromLink from "../learning-centre/dialogs/FetchFromLink.svelte";
import SetPage from "../library/progress/SetPage.svelte";
import AniListSync from "../sources/dialogs/AniListSync.svelte";
import ProfileEdit from "../library/profile/ProfileEdit.svelte";
import ChangePassphrase from "../library/private/ChangePassphrase.svelte";
import Unlock from "../library/private/Unlock.svelte";
import Shortcuts from "./shortcuts/Shortcuts.svelte";
import Welcome from "./start/Welcome.svelte";
import SaveView from "../library/page/SaveView.svelte";
import AdjustPicture from "../library/frame/AdjustPicture.svelte";
import SeriesServers from "../watch-read/dialogs/SeriesServers.svelte";
import { ui } from "./core";
import { store } from "./store.svelte";
import type { Modal } from "./model";

const DIALOGS: Record<string, Component> = {
    item: ItemCard,
    add: AddDialog,
    listnew: NewList,
    listpick: ListPick,
    tierpick: TierPick,
    pickitem: PickItems,
    castlist: CastToList,
    char: CharacterDialog,
    charadd: AddCharacter,
    person: PersonDialog,
    favedit: FavouriteEdit,
    io: ImportDialog,
    paste: PasteList,
    csvmap: ColumnMatch,
    smartmatch: SmartMatch,
    exportpick: ExportDialog,
    covers: RefreshArt,
    coverpick: ChooseCovers,
    pick: PickForMe,
    setpage: SetPage,
    anilist: AniListSync,
    "profile-edit": ProfileEdit,
    vaultpass: ChangePassphrase,
    keys: Shortcuts,
    unlock: Unlock,
    welcome: Welcome,
    saveview: SaveView,
    discover: DiscoverDialog,
    lcnew: NewCourse,
    pwbook: Reading,
    lcimport: FetchFromLink,
    frame: AdjustPicture,
    seriesservers: SeriesServers,
};

let shown: { kind: string; box: HTMLElement; app: ReturnType<typeof mount>; m: Modal | null } | null = null;

export const hasDialog = (kind: string) => Object.hasOwn(DIALOGS, kind);
/** whether this box already holds this dialog: its kind, opened this time (another of the same kind opened in its
 *  place starts afresh, as a dialog drawn as HTML does) */
export const isDrawn = (kind: string, box: Element | null) =>
    !!shown && shown.kind === kind && shown.box === box && shown.m === ui.modal;
/** draw the dialog in its box, or, when it's already there, bring it up to date with the store */
export function drawDialog(kind: string, box: HTMLElement) {
    if (isDrawn(kind, box)) {
        store.flush("ui"); // whatever changed the dialog's state in place asked for it to be drawn again
        return;
    }
    dropDialog();
    box.dataset.svelte = ""; // the older code that reaches into the page leaves this box to the dialog
    shown = { kind, box, app: mount(DIALOGS[kind], { target: box }), m: ui.modal };
    flushSync();
}
export function dropDialog() {
    if (!shown) return;
    unmount(shown.app);
    delete shown.box.dataset.svelte;
    shown = null;
}
