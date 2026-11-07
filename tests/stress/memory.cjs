// Stress: memory with a big library (10,000 made-up items, no export needed). How much the page holds after drawing the
// library, and whether going round the app, opening cards and reading a book leaves anything behind each time.
// Prints the numbers, and fails if they go past the budget below.
const ENV = require('../e2e/env.cjs');
const { chromium } = require('playwright'); const { setup } = require('../e2e/mocks.cjs');
const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
const MB = n => (n / 1048576).toFixed(1) + ' MB';
const BUDGET = { heap: 60e6, nodes: 9000, growth: 6e6 }; // after the library draws; what a round of the app may add
(async () => {
  const b = await chromium.launch(ENV.launch), c = await b.newContext({ viewport: { width: 1440, height: 900 } }); await setup(c);
  const p = await c.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); const ev = (f, a) => p.evaluate(f, a);
  const cdp = await c.newCDPSession(p); await cdp.send('Performance.enable');
  const measure = async () => {
    await cdp.send('HeapProfiler.collectGarbage'); await p.waitForTimeout(300); await cdp.send('HeapProfiler.collectGarbage');
    const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
    return { heap: m.JSHeapUsedSize, nodes: m.Nodes, listeners: m.JSEventListeners, blobs: await ev(() => (window.__blobs || 0)) };
  };
  await p.addInitScript(() => {
    window.__blobs = 0; const make = URL.createObjectURL, free = URL.revokeObjectURL;
    URL.createObjectURL = x => { window.__blobs++; return make(x); }; URL.revokeObjectURL = u => { window.__blobs--; return free(u); };
  });
  await p.goto(ENV.APP); await p.waitForTimeout(800); await p.fill('#wl-name', 'T'); await p.click('[data-act="welcome-done"]');
  const empty = await measure();
  console.log('     empty app:', MB(empty.heap), empty.nodes, 'nodes');

  // 10,000 items across the media, each with a cover, added in one go as an import would
  await ev(() => {
    const M = ['anime', 'manga', 'book', 'film', 'tv', 'game', 'comic', 'album'], S = ['active', 'done', 'want', 'paused'], add = {};
    for (let i = 0; i < 10000; i++)
      add[newId('Item ' + i, M[i % M.length])] = migrateItem({ medium: M[i % M.length], title: 'Item ' + i, status: S[i % S.length],
        rating: i % 10, year: 1980 + (i % 45), cover: `https://s4.anilist.co/cover/${i}.jpg`, genres: ['Drama', 'Action'].slice(0, 1 + (i % 2)),
        copy: 'none', notes: '', addedAt: nowISO(), source: 'you' });
    change('Add 10,000', Object.keys(add), (_, id) => add[id]);
    ui.page = 'profile'; ui.tab = 'library'; render();
  });
  await p.waitForTimeout(1500);
  const ms = await ev(() => { const t = performance.now(); render(); return Math.round(performance.now() - t); });
  console.log('     drawing the library page takes', ms, 'ms');
  ok('…which stays under a third of a second', ms < 330, ms + ' ms');
  const lib = await measure();
  console.log('     10,000 items, library drawn:', MB(lib.heap), lib.nodes, 'nodes,', lib.listeners, 'listeners');
  ok(`the library holds under ${MB(BUDGET.heap)} of JavaScript`, lib.heap < BUDGET.heap, MB(lib.heap));
  ok(`…and draws under ${BUDGET.nodes} page elements until you scroll`, lib.nodes < BUDGET.nodes, String(lib.nodes));
  for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 4000); await p.waitForTimeout(250); }   // scroll, so more shelves draw
  const scrolled = await measure();
  console.log('     …scrolled a long way down:', MB(scrolled.heap), scrolled.nodes, 'nodes');

  // round the app a few times: pages, a card opened and closed, settings
  const round = () => ev(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms)), ids = [...items.keys()];
    for (const page of ['profile', 'watch', 'read', 'profile']) { ui.page = page; render(); await wait(60); }
    for (const tab of ['stats', 'lists', 'library']) { ui.tab = tab; render(); await wait(60); }
    for (let i = 0; i < 10; i++) { openItem(ids[i * 97]); await wait(30); closeModal(); await wait(20); }
    goSettings('appearance'); await wait(60); goSettings('data'); await wait(60);
    ui.page = 'profile'; ui.tab = 'library'; render(); await wait(100);
  });
  await round();
  const first = await measure();
  for (let i = 0; i < 4; i++) await round();
  const after = await measure();
  console.log('     after 5 rounds:', MB(after.heap), after.nodes, 'nodes,', after.listeners, 'listeners');
  ok(`four more rounds of the app add under ${MB(BUDGET.growth)}`, after.heap - first.heap < BUDGET.growth, MB(after.heap - first.heap));
  ok('…and leave no extra page elements or listeners behind', after.nodes <= first.nodes * 1.05 && after.listeners <= first.listeners * 1.05,
    `${first.nodes} → ${after.nodes} nodes, ${first.listeners} → ${after.listeners} listeners`);

  // a 40-page comic opened and closed three times: its pages are let go each time
  const pages = await ev(async () => {
    const c = document.createElement('canvas'); c.width = 800; c.height = 1200; const g = c.getContext('2d');
    const files = [];
    for (let i = 0; i < 40; i++) { g.fillStyle = `hsl(${i * 9} 50% 50%)`; g.fillRect(0, 0, 800, 1200); files.push(await new Promise(r => c.toBlob(r, 'image/png'))); }
    const before = window.__blobs;
    for (let k = 0; k < 3; k++) { RD.files = [{ images: files, name: 'comic.cbz' }]; await readStart(0); readerDrop(); }
    return { before, after: window.__blobs };
  });
  ok('a comic opened and closed three times keeps none of its pages in memory', pages.after === pages.before, JSON.stringify(pages));

  ok('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
})().catch(e => { console.log('FAIL ' + e.message.split('\n')[0]); process.exit(1); });
