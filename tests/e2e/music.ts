// Music: albums are a kind of thing in your library, with their own Music mode (after the Learning Centre; the Hub leaves them to it,
// as it does games). Search finds them on MusicBrainz, adding one brings its tracks and length, and the words fit
// ("Listened", "Plan to listen", the artist). An older library gets the Music mode once. MusicBrainz is faked (mocks.ts).
import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok, evaluator } from "./helpers.ts";
(async () => {
    const b = await chromium.launch(ENV.launch),
        c = await b.newContext({ viewport: { width: 1300, height: 900 } });
    await setup(c);
    const p = await c.newPage();
    const errs: string[] = [];
    p.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(p);
    await p.goto(ENV.APP);
    await p.waitForTimeout(800);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');

    const st = await ev(() => ({
        modes: __ulTest.meta.modes.map(m => m.id),
        hub: __ulTest.modeById("universal").match,
        medium: __ulTest.MEDIA.album && [
            __ulTest.MEDIA.album.name,
            __ulTest.MEDIA.album.group,
            __ulTest.MEDIA.album.unit[1],
        ],
    }));
    ok(
        "albums are a kind of thing: Music, listened to, counted in tracks",
        st.medium && st.medium.join() === "Music,listen,tracks",
        JSON.stringify(st.medium)
    );
    ok(
        "a Music mode, right after the Learning Centre (the modes you know keep their shortcuts), and the Hub leaves albums to it",
        st.modes.indexOf("music") === st.modes.indexOf("academic") + 1 && st.hub!.includes("!album"),
        JSON.stringify(st)
    );

    // ----- search, as anywhere: a Music column -----
    await ev(() => __ulTest.focusSearch());
    await p.fill("#gq", "ok computer");
    await p.waitForTimeout(3000);
    const st2 = await ev(() => {
        const col = [...document.querySelectorAll<HTMLElement>(".gscol")].find(x =>
            /Music/.test((x.querySelector(".gsg") || {}).textContent || "")
        );
        return col ? col.innerText : null;
    });
    ok(
        "search has a Music column with albums from MusicBrainz, artist included",
        !!st2 && /OK Computer/.test(st2) && /Radiohead/.test(st2),
        (st2 || "").slice(0, 120)
    );
    await ev(() => __ulTest.closeSearch && __ulTest.closeSearch()).catch(() => {});

    // ----- adding one: its tracks and length come with it -----
    const st3 = await ev(async () => {
        const [hit] = await __ulTest.searchMedium("album", "ok computer");
        const d = await __ulTest.candidateDetails(hit);
        const id = __ulTest.addItem({ ...d, status: "done" });
        const it = __ulTest.items.get(id);
        return {
            id,
            title: it!.title,
            creator: it!.creator,
            kind: it!.kind,
            year: it!.year,
            total: it!.total,
            runtime: it!.runtime,
            mbid: it!.ext.mbid,
            cover: it!.cover,
            word: __ulTest.statusWord("done", "album"),
            want: __ulTest.statusWord("want", "album"),
            mins: __ulTest.minutesSpent(it!),
            inMusic: __ulTest.modeItems(__ulTest.modeById("music")).some(x => x.id === id),
            inHub: __ulTest.modeItems(__ulTest.modeById("universal")).some(x => x.id === id),
        };
    });
    ok(
        "adding an album brings its artist, year, kind and cover",
        st3.creator === "Radiohead" &&
            st3.year === 1997 &&
            st3.kind === "Album" &&
            /coverartarchive/.test(st3.cover!) &&
            st3.mbid === "mb-okc",
        JSON.stringify(st3)
    );
    ok(
        "…and its 12 tracks at about 5 minutes each (an hour listened, once it's done)",
        st3.total === 12 && st3.runtime === 5 && st3.mins === 60,
        JSON.stringify({ t: st3.total, r: st3.runtime, m: st3.mins })
    );
    ok("the words fit: Listened, Plan to listen", st3.word === "Listened" && st3.want === "Plan to listen");
    ok("it's in Music, not the Hub", st3.inMusic && !st3.inHub);
    await ev(() => {
        __ulTest.setMode("music");
    });
    await p.waitForTimeout(400);
    if (process.env.SHOTS) await p.screenshot({ path: ENV.OUT + "/music-mode.png" });
    ok(
        "the Music overview has no Characters panel",
        await ev(
            () =>
                !/Characters/.test(document.querySelector<HTMLElement>("#main")!.innerText) &&
                /Listened/.test(document.querySelector<HTMLElement>("#main")!.innerText)
        )
    );
    await ev(id => {
        __ulTest.setMode("music");
        __ulTest.openItem(id);
    }, st3.id);
    await p.waitForTimeout(400);
    const st4 = await ev(() => ({
        text: document.querySelector(".modal") ? document.querySelector<HTMLElement>(".modal")!.innerText : "",
        chars: !!document.querySelector('[data-tab="chars"], [data-k="chars"]'),
    }));
    ok(
        "its card says Artist, and has no Characters tab",
        /Artist/.test(st4.text) && /Radiohead/.test(st4.text) && !/Characters/.test(st4.text),
        st4.text.slice(0, 160)
    );
    await ev(() => __ulTest.closeModal());

    // ----- imports and older libraries -----
    ok(
        'a spreadsheet saying "Vinyl LP" or "Album" means music',
        await ev(
            () =>
                __ulTest.mediumFromText("Vinyl LP") === "album" &&
                __ulTest.mediumFromText("Album") === "album" &&
                __ulTest.mediumFromText("Video game") === "game"
        )
    );
    const st5 = await ev(() => {
        __ulTest.meta.modes = __ulTest.meta.modes.filter(m => m.id !== "music");
        const h = __ulTest.modeById("universal");
        h.match = h.match!.filter(x => x !== "!album");
        __ulTest.meta.settings.music1 = false;
        __ulTest.migratePaths();
        __ulTest.migratePaths();
        return {
            n: __ulTest.meta.modes.filter(m => m.id === "music").length,
            hub: __ulTest.modeById("universal").match!.filter(x => x === "!album").length,
        };
    });
    ok(
        "an older library gets the Music mode once, however often it starts",
        st5.n === 1 && st5.hub === 1,
        JSON.stringify(st5)
    );

    ok("no page errors", !errs.length, errs.slice(0, 3).join(" | "));
    await b.close();
    process.exit(0);
})().catch(e => {
    console.log("FAIL " + e.message.split("\n")[0]);
    process.exit(1);
});
