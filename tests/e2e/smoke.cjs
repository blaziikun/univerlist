// The basics, with no personal data (so it can run anywhere, including on GitHub):
// opens, adds things, exports, and a fresh browser imports that export back.
const ENV = require('./env.cjs');
const { chromium } = require('playwright'); const { setup } = require('./mocks.cjs'); const fs = require('fs');
const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
(async () => {
  const browser = await chromium.launch(ENV.launch);
  const open = async () => { const ctx = await browser.newContext({ acceptDownloads: true }); await setup(ctx); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto(ENV.APP); await p.waitForTimeout(800); await p.fill('#wl-name', 'Test'); await p.click('[data-act="welcome-done"]'); return p; };
  const a = await open();
  ok('opens', await a.evaluate(() => typeof items === 'object' && document.querySelector('#main').children.length > 0));
  await a.evaluate(() => { addItem({ medium: 'anime', title: 'Frieren', status: 'done', rating: 10 }); addItem({ medium: 'book', title: 'Dune', creator: 'Frank Herbert', status: 'active' }); addItem({ medium: 'game', title: 'Hades', platform: 'Switch' }); });
  ok('adds', await a.evaluate(() => items.size) === 3);
  await a.evaluate(() => goSettings('io')); await a.waitForTimeout(300);
  const [dl] = await Promise.all([a.waitForEvent('download', { timeout: 60000 }), a.click('[data-act="export-open"]').then(() => a.click('.modal [data-act="export-zip"]'))]);
  const zip = ENV.OUT + '/smoke-export.zip'; await dl.saveAs(zip); ok('exports a zip', fs.statSync(zip).size > 500 && /^profile-export_.+_\d{4}-\d\d-\d\d\.zip$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  const b = await open();
  await b.setInputFiles('#file-import', zip); await b.waitForSelector('[data-act="import-replace"]'); await b.click('[data-act="import-replace"]');
  await b.waitForFunction(() => !ui.modal, null, { timeout: 60000 }); await b.waitForTimeout(500);
  ok('imports it back', await b.evaluate(() => [...items.values()].map(x => x.title).sort().join()) === 'Dune,Frieren,Hades');
  ok('no page errors', !a.errs.length && !b.errs.length, [...a.errs, ...b.errs].slice(0, 3).join(' / '));
  await browser.close();
})();
