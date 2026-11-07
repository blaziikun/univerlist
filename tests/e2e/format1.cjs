// An export in the oldest layout (everything under data/) imports whole: library, favourites, lists, preferences, themes, profile. (Its old academic part comes into the Learning Centre as a path.)
const ENV = require('./env.cjs');
const { chromium } = require('playwright'); const { setup } = require('./mocks.cjs');
const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
(async () => {
  const b = await chromium.launch(ENV.launch), c = await b.newContext(); await setup(c); const p = await c.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(ENV.APP); await p.waitForTimeout(800); await p.fill('#wl-name', 'T'); await p.click('[data-act="welcome-done"]');
  await p.setInputFiles('#file-import', ENV.FIX + '/format1.zip'); await p.waitForSelector('[data-act="import-replace"]');
  const parts = await p.evaluate(() => [...document.querySelectorAll('.part')].map(x => x.querySelector('b').innerText));
  ok('every part is offered', ['Library', 'Favourites & characters', 'Lists', 'Preferences', 'Themes', 'Profile'].every(n => parts.includes(n)) && parts.includes('Learning Centre'), parts.join(', '));
  await p.click('[data-act="import-replace"]'); await p.waitForFunction(() => !ui.modal, null, { timeout: 60000 }); await p.waitForTimeout(500);
  const r = await p.evaluate(() => ({ n: items.size, fav: meta.favOrder.length, queue: meta.queue.length, lists: meta.lists.length, prog: meta.courses.v === 2 ? meta.courses.paths.length : JSON.stringify(meta.courses).slice(0, 80), theme: !!(meta.themes || {}).mine, name: (meta.profile || {}).name }));
  ok('everything came in', r.n === 4 && r.fav === 1 && r.queue === 1 && r.lists >= 1 && r.prog === 1 && r.theme && r.name === 'Test', JSON.stringify(r));
  ok('no page errors', !errs.length, errs.slice(0, 3).join(' / ')); await b.close(); })();
