// Watch from a card in your library asks extensions for exactly what a Watch search does (same title, season, episode and ids)
const ENV = require('./env.cjs');
const { chromium } = require('playwright'); const { setup } = require('./mocks.cjs');
(async () => { const b = await chromium.launch(ENV.launch), c = await b.newContext(); await setup(c); const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (f, a) => p.evaluate(f, a);
  await p.goto(ENV.APP); await p.waitForTimeout(800); await p.fill('#wl-name', 'T'); await p.click('[data-act="welcome-done"]');
  await ev(() => { window.__ctx = []; EXT.list.push({ manifest: { id: 'fake', name: 'Fake', permissions: ['watch.sources'] }, data: {}, on: true }); EXT.frames.set('fake', { jobs: new Set(['watch.sources']) });
    extCall = async (id, job, args) => { window.__ctx.push({ path: window.__path, ...args[0] }); return []; };
    window.__id = addItem({ medium: 'anime', kind: 'TV', title: 'Bleach', year: 2004, ext: { anilist: 269 }, total: 366 }); });
  await ev(() => { window.__path = 'card'; watchFromItem(window.__id); }); await p.waitForTimeout(3000);
  await ev(() => { W.player = null; renderPlayer(); window.__path = 'search'; ui.page = 'watch'; render(); watchOpen({ title: 'Bleach', medium: 'anime', kind: 'TV', year: 2004, ext: { anilist: 269 } }, { play: true }); }); await p.waitForTimeout(3000);
  const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
  const C = await ev(() => window.__ctx.map(c => ({ path: c.path, title: c.title, st: c.seasonTitle, season: c.season, ep: c.episode, ids: c.ids, film: c.film })));
  const card = C.find(c => c.path === 'card'), srch = C.find(c => c.path === 'search'), strip = x => x && JSON.stringify({ ...x, path: 0 });
  ok('extensions are asked from a card', !!card, JSON.stringify(C));
  ok('the card asks for the same thing as search', !!card && strip(card) === strip(srch), JSON.stringify(C));
  ok('no page errors', !errs.length, errs.join(' | ')); await b.close(); })();
