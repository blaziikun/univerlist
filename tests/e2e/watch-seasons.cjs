const ENV = require('./env.cjs');
ENV.needExport();
const { chromium } = require('playwright'); const { setup } = require('./mocks.cjs');
const D = __dirname, ZIP = ENV.EXPORT, W = +(process.argv[2] || 1440);
(async () => {
  const browser = await chromium.launch(ENV.launch);
  const ctx = await browser.newContext({ viewport: { width: W, height: W < 500 ? 844 : 900 } }); await setup(ctx);
  const page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message));
  const ev = (f, a) => page.evaluate(f, a), ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
  await page.goto(ENV.APP); await page.waitForTimeout(1000); await page.fill('#wl-name', 'Sam'); await page.click('[data-act="welcome-done"]');
  await page.setInputFiles('#file-import', ZIP); await page.waitForSelector('[data-act="import-replace"]'); await page.click('[data-act="import-replace"]'); await page.waitForTimeout(3000);
  // Little Busters in watch: together
  const lb = await ev(() => [...items.entries()].filter(([, b]) => /^Little Busters/.test(b.title) && b.medium === 'anime').map(([id, b]) => id + ':' + b.kind));
  console.log(lb.join(' , '));
  await ev(() => { const id = [...items.entries()].find(([, b]) => /^Little Busters!$/.test(b.title) || /^Little Busters/.test(b.title))[0]; watchFromItem(id); }); await page.waitForTimeout(1500);
  ok('LB seasons together', await ev(() => W.seasons.length), await ev(() => JSON.stringify(W.seasons.map(s => s.title || s.label))));
  await page.click('[data-act="wp-opts"]'); await page.waitForTimeout(200);
  await ev(() => { meta.settings.seasonsMode = 'together'; meta.settings.watchPage = {}; });
  // combine across library
  await ev(() => seasonsAcrossLibrary(true)); ok('combined across library', await ev(() => all().filter(b => partsOf(b).length).length > 0), await ev(() => all().filter(b => partsOf(b).length).length + ''));
  ok('LB combined parts', await ev(() => { const p = [...items.values()].find(b => /^Little Busters/.test(b.title) && partsOf(b).length); return p ? partsOf(p).length : 0; }));
  // search pick with a linked source autoplays
  await ev(() => { const id = [...items.entries()].find(([, b]) => b.title === 'White Collar')?.[0] || [...items.entries()].find(([, b]) => b.medium === 'tv')[0]; const b = items.get(id); quietPatch(id, { sources: { S1E1: 'http://192.168.1.20/a.mp4' } }); ui.page = 'watch'; W.show = null; W.view = 'home'; render(); });
  await page.fill('#wq', 'White Collar'); await page.waitForFunction(() => (W.results || []).length > 0 && !W.busy, null, { timeout: 8000 });
  console.log(await ev(() => JSON.stringify({page: ui.page, q: W.q, busy: W.busy, wq: !!document.querySelector('#wq'), loc: all().filter(b => b.title === 'White Collar').length, mode: ui.mode})));
  ok('results', await ev(() => (W.results || []).length > 0), await ev(() => JSON.stringify((W.results || []).slice(0, 3).map(r => r.title + '|' + r.medium))));
  console.log('focus', await ev(() => document.activeElement && (document.activeElement.id || document.activeElement.className)));
  await page.keyboard.press('Enter'); await page.waitForTimeout(3000);
  ok('search → plays straight away', await ev(() => !!W.player && !!document.querySelector('#cinema')), await ev(() => JSON.stringify({ v: W.view, p: !!W.player, s: W.seasons.length, e: (W.seasons[W.si] || {}).eps && W.seasons[W.si].eps.length })));
  await page.screenshot({ path: ENV.OUT + `/s_autoplay_${W}.png` });
  // read: item page shows only the item
  await page.click('[data-act="cin-close"]').catch(() => {}); await page.waitForTimeout(200);
  await ev(() => { const id = [...items.entries()].find(([, b]) => b.medium === 'manga' && b.status === 'active')[0]; readFromItem(id); }); await page.waitForTimeout(500);
  ok('read item page: no continue rows', await ev(() => ![...document.querySelectorAll('.wrow h3')].some(h => /Continue|Planned/.test(h.textContent))));
  await page.screenshot({ path: ENV.OUT + `/s_readitem_${W}.png` });
  ok('no page errors', !errs.length, errs.slice(0, 3).join(' / '));
  await browser.close();
})();
