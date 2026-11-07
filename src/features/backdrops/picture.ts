// src/features/backdrops/picture.ts
// ─────────────────────────────────────────────────────────────────
//  Backdrops: a picture for the background
//
//  The picture you choose is redrawn on your device as a JPEG no wider than 1600 pixels. That keeps it small enough to
//  sync and share (a few hundred KB), and drops everything else the file carried, like where a photo was taken.
// ─────────────────────────────────────────────────────────────────

import { MAX_PICTURE } from "./backdrop";

export async function pictureFrom(file: File): Promise<string> {
    if (!/^image\//.test(file.type)) throw new Error("That isn't a picture.");
    const bmp = await createImageBitmap(file).catch(() => {
        throw new Error("That picture couldn't be opened.");
    });
    // smaller and smaller until it fits (most photos fit the first time)
    for (const [side, q] of [
        [1600, 0.82],
        [1280, 0.75],
        [960, 0.7],
        [720, 0.65],
    ]) {
        const sc = Math.min(1, side / Math.max(bmp.width, bmp.height)),
            cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.round(bmp.width * sc));
        cv.height = Math.max(1, Math.round(bmp.height * sc));
        cv.getContext("2d")!.drawImage(bmp, 0, 0, cv.width, cv.height);
        const url = cv.toDataURL("image/jpeg", q);
        if (url.length <= MAX_PICTURE) {
            bmp.close();
            return url;
        }
    }
    bmp.close();
    throw new Error("That picture is too detailed to use. Try a smaller one.");
}
