const ENV = require('./env.cjs');
ENV.needExport();
const { chromium } = require('playwright'); const { setup } = require('./mocks.cjs');
const D = __dirname, ZIP = ENV.EXPORT;
(async () => {
  const browser = await chromium.launch(ENV.launch);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await setup(ctx);
  const page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message));
  const ev = (f, a) => page.evaluate(f, a), ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
  await page.goto(ENV.APP); await page.waitForTimeout(1000); await page.fill('#wl-name', 'Sam'); await page.click('[data-act="welcome-done"]');
  await page.setInputFiles('#file-import', ZIP); await page.waitForSelector('[data-act="import-replace"]'); await page.click('[data-act="import-replace"]'); await page.waitForTimeout(3000);
  for (const z of ['lbweird.zip', 'lb1.zip', 'lb2.zip']){
    await ev(() => { for (const [id, b] of items) if (b.medium === 'game') quietPatch(id, { lbArt: undefined, spineArt: undefined, coverPicked: false }); const g = [...items.entries()].find(([, b]) => b.title === 'Super Mario Galaxy'); quietPatch(g[0], { platform: 'Wii' }); Object.assign(LB, { done: false, matched: 0 }); goSettings('data'); });
    await page.waitForTimeout(300);
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-act="lb-pick"]')]); const t0 = Date.now(); await fc.setFiles(ENV.FIX + '/' + z);
    await page.waitForFunction(() => LB.done || LB.err, null, { timeout: 120000 });
    const r = await ev(() => { const g = [...items.values()].find(b => b.title === 'Super Mario Galaxy'), a = [...items.values()].find(b => b.title === 'Apex Legends'); return { err: LB.err, m: LB.matched, cover: g.cover, spine: g.spineArt, art: (g.lbArt || []).map(x => x.label), apex: a && a.cover }; });
    ok(z + ' Wii box EU + spine', /SMG-eu.jpg$/.test(r.cover) && /SMG\.jpg$/.test(r.spine || '') && /apex/.test(r.apex || ''), JSON.stringify(r) + ' ' + (Date.now() - t0) + 'ms');
  }
  await page.screenshot({ path: ENV.OUT + '/s_lb_1440.png' });
  ok('slim copy kept', await ev(async () => !!(await idbGet('x', 'idx', await lbStore()))));
  await page.reload(); await page.waitForTimeout(2500);
  const nid = await ev(() => addItem({ medium: 'game', title: 'Super Mario Galaxy', platform: 'Nintendo Switch', status: 'want' }, 'Add'));
  await page.waitForTimeout(3000);
  ok('new game boxed from the slim copy', await ev(i => /SMGsw\.jpg$/.test(items.get(i).cover || ''), nid), await ev(i => items.get(i).cover + ' ' + items.get(i).lbChecked, nid));
  await ev(i => { openItem(i); ui.modal.tab = 'art'; renderOverlay(); }, nid); await page.waitForTimeout(300);
  ok('spine controls', !!(await page.$('[data-act="spine-upload"]')));
  await page.click('[data-act="find-art"]'); await page.waitForTimeout(2500);
  const sp = await page.$('[data-act="pick-art"][data-as="spine"]'); if (sp){ await sp.click(); await page.waitForTimeout(200); }
  ok('pick a spine', await ev(i => !!items.get(i).spinePicked && !!items.get(i).spineArt, nid));
  await page.screenshot({ path: ENV.OUT + '/s_spine_1440.png' });
  ok('no page errors', !errs.length, errs.slice(0, 3).join(' / '));
  await browser.close();
})();
