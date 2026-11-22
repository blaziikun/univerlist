// src/features/update/moved.ts
// ─────────────────────────────────────────────────────────────────
//  UniverList's address: univerlist.app, and univerlist.sayel.dev, where it began, which still answers
//
//  A browser keeps a library for the address it was made at, so nothing in it moves by itself. At the old address, a
//  browser with nothing in it goes straight on to the new one (the same page). One with a library stays usable there
//  and says how to take it across (Moved.svelte): signed in, sign in at the new address with the recovery code and the
//  library comes down (a passkey belongs to its address, so a new one is made there); not signed in, Download
//  everything here and drop the file there. The old address keeps working for good: the /source, /issues, /report
//  and /sponsor links on it must never break.
// ─────────────────────────────────────────────────────────────────

export const HOME = "https://univerlist.app";
const OLD_HOSTS = ["univerlist.sayel.dev"];

/** this page is at the old address */
export const atOldAddress = () => OLD_HOSTS.includes(location.hostname);

/** once the app has started at the old address: a browser with no library goes on to the new one, the same page;
 *  one with a library is shown how to take it across */
export function movedCheck(hasLibrary: boolean, show: () => void, go = (url: string) => location.replace(url)) {
    if (!atOldAddress()) return;
    if (hasLibrary) show();
    else go(HOME + location.pathname + location.search + location.hash);
}
