// The same show can arrive as TV (TMDB, TVmaze) and as anime (AniList). Search and the review step say so, and a live-action remake years later isn't flagged.
const ENV = require('./env.cjs');
const { chromium } = require('playwright'); const { setup } = require('./mocks.cjs');
const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
(async () => {
  const b = await chromium.launch(ENV.launch), c = await b.newContext(); await setup(c); const p = await c.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(ENV.APP); await p.waitForTimeout(800); await p.fill('#wl-name', 'T'); await p.click('[data-act="welcome-done"]'); await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    addItem({ medium: 'tv', title: 'Spy x Family', year: 2022, status: 'want' });                                  // added from the TV search
    addItem({ medium: 'tv', title: 'Cowboy Bebop', year: 2021, status: 'want' });                                  // the live-action one
    addItem({ medium: 'anime', title: 'Frieren: Beyond Journey’s End', alt: { en: 'Frieren: Beyond Journey’s End', romaji: 'Sousou no Frieren' }, year: 2023, status: 'want' });
    const html = (medium, c) => MODALS.add({ step: 'search', medium, results: [c], q: 'x', busy: false });
    return {
      sameShow: !!findSibling('Spy x Family', 'anime', 2022),
      yearOff1: !!findSibling('Spy x Family', 'anime', 2023),
      remake: !!findSibling('Cowboy Bebop', 'anime', 1998),
      otherTitle: !!findSibling('Spy x Family Code: White', 'anime', 2023),
      other: !!findSibling('Sousou no Frieren', 'tv', 2023),
      notBooks: findSibling('Spy x Family', 'book', 2022) === null,
      listMarked: /In your library as show/.test(html('anime', { title: 'Spy x Family', medium: 'anime', year: 2022, total: 25, ext: { anilist: 140960 }, src: 'anilist' })),
      listClean: !/In your library/.test(html('anime', { title: 'Cowboy Bebop', medium: 'anime', year: 1998, total: 26, ext: { anilist: 1 }, src: 'anilist' })),
      eps: /25 eps/.test(html('anime', { title: 'Spy x Family', medium: 'anime', year: 2022, total: 25, ext: { anilist: 140960 }, src: 'anilist' })),
      review: /already in your library as show/.test(MODALS.add({ step: 'review', medium: 'anime', draft: { title: 'Spy x Family', medium: 'anime', year: 2022, ext: { anilist: 140960 } } })),
    };
  });
  ok('same show, TV then anime, is spotted', r.sameShow);
  ok('a year apart still counts', r.yearOff1);
  ok('a live-action remake decades later does not', !r.remake);
  ok('a different title does not', !r.otherTitle);
  ok('the romaji / English names count', r.other);
  ok('it only looks across anime and TV', r.notBooks);
  ok('the search result says where you have it', r.listMarked);
  ok('an unrelated result is left alone', r.listClean);
  ok('results show the episode count', r.eps);
  ok('the review step warns before a second entry', r.review);
  ok('no page errors', !errs.length, errs.slice(0, 3).join(' / ')); await b.close(); })();
