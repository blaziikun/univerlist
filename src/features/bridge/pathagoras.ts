// src/features/bridge/pathagoras.ts
// ─────────────────────────────────────────────────────────────────
//  The bridge to Pathagoras (pathagoras.sayel.dev), the learning app that's the learning part of this library.
//
//  Pathagoras opens /bridge?from=pathagoras in a small window. Once your library has loaded here:
//    1. this page tells Pathagoras it's ready (postMessage, to Pathagoras's exact address only)
//    2. Pathagoras offers the books you're reading or have finished there
//    3. this page asks you, showing what would change; nothing happens until you allow it
//    4. allowed: statuses move forward (never back), books it has that aren't here are added, tagged Learning, and
//       every Learning book goes back; then the window closes. Not allowed: it says so, and closes
//  Messages from anywhere else, or from anything but the window that opened this one, are ignored. The page needs its
//  opener, so /bridge is the one address that isn't Cross-Origin-Opener-Policy: same-origin (public/_headers), and the
//  service worker leaves it to the network (vite.config.ts). The protocol is Pathagoras's docs/univerlist-bridge.md.
// ─────────────────────────────────────────────────────────────────

import { addItem, items, LEARNING_TAG } from "../core/core";
import { isBooted } from "../core/events";
import type { Item } from "../core/model";
import { setStatus } from "../library/item-actions";
import { isLearning, planBridge, readOffer, type Sent } from "./plan";

const PATHAGORAS = "https://pathagoras.sayel.dev";
const VERSION = 1;

const isBridge = () => location.pathname.replace(/\.html$/, "") === "/bridge";

export function startPathagorasBridge(): void {
    if (!isBridge() || new URLSearchParams(location.search).get("from") !== "pathagoras") return;
    const opener = window.opener as Window | null;
    if (!opener) return;
    const say = (step: string, extra: object = {}) =>
        opener.postMessage({ kind: "univerlist-bridge", v: VERSION, step, ...extra }, PATHAGORAS);
    addEventListener("message", event => {
        if (event.origin !== PATHAGORAS || event.source !== opener) return;
        const offers = readOffer(event.data, VERSION);
        if (offers) ask(offers, say);
    });
    const wait = setInterval(() => {
        if (!isBooted()) return;
        clearInterval(wait);
        say("ready");
    }, 100);
}

const learningBooks = () =>
    [...items.entries()].map(([id, it]) => ({ ...it, id })).filter(it => isLearning(it, LEARNING_TAG));
const allBooks = () => [...items.entries()].map(([id, it]) => ({ ...it, id })).filter(it => it.medium === "book");

function ask(offers: ReturnType<typeof readOffer> & object, say: (step: string, extra?: object) => void) {
    const plan = planBridge(offers, allBooks());
    const box = document.createElement("div");
    box.className = "bridge-ask";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "bridge-title");
    const line = (text: string) => {
        const p = document.createElement("p");
        p.textContent = text;
        return p;
    };
    const title = document.createElement("h2");
    title.id = "bridge-title";
    title.textContent = "Sync with Pathagoras?";
    const allow = document.createElement("button"),
        no = document.createElement("button");
    allow.textContent = "Allow";
    allow.className = "btn primary";
    no.textContent = "Not now";
    no.className = "btn";
    const buttons = document.createElement("div");
    buttons.className = "row";
    buttons.append(allow, no);
    box.append(
        title,
        line(
            `Pathagoras will see your ${learningBooks().length} Learning books (tagged Learning, or of kind Academic).`
        ),
        line(
            `Here, ${plan.moves.length} would move on (statuses only go forward) and ${plan.adds.length} would be added, tagged Learning.`
        ),
        line("Nothing else in your library is read or changed."),
        buttons
    );
    document.body.append(box);
    allow.focus();
    no.onclick = () => {
        say("declined");
        close();
    };
    allow.onclick = () => {
        for (const m of plan.moves) setStatus(m.id, m.status);
        for (const a of plan.adds)
            addItem({
                title: a.title,
                creator: a.creator,
                medium: "book",
                kind: "Academic",
                tags: [LEARNING_TAG],
                status: a.status,
            } as Partial<Item> & { title: string });
        const books: Sent[] = learningBooks().map(b => ({
            id: b.id,
            title: b.title,
            creator: b.creator || "",
            status: b.status,
        }));
        say("books", { books, added: plan.adds.length, moved: plan.moves.length });
        box.replaceChildren(line("Done. This window closes in a moment."));
        // a moment for the library to save before the window goes
        setTimeout(close, 1500);
    };
}
