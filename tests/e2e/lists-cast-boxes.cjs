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
  // list multi add
  const lid = await ev(() => { const id = newListId(); changeMeta('New', 'lists', L => [...L, { id, name: 'Test', ids: [], numbered: true }]); setMode('universal'); goTab('lists'); ui.listId = id; render(); return id; });
  await page.click('[data-act="li-add"]'); await page.waitForTimeout(300);
  await page.click('[data-act="pi-scope"][data-k="all"]'); await page.waitForTimeout(200);
  const ids = await ev(() => [...document.querySelectorAll('.pigrid .pirow')].slice(0, 5).map(b => b.dataset.id));
  for (const i of ids) await page.click(`.pirow[data-id="${i}"]`);
  await page.screenshot({ path: ENV.OUT + `/s_pick_${W}.png` });
  await page.click('[data-act="pi-add"]'); await page.waitForTimeout(200);
  ok('added 5 at once', await ev(l => meta.lists.find(x => x.id === l).ids.length === 5, lid));
  await ev(() => closeModal());
  // characters → a list
  await ev(() => { const id = [...items.entries()].find(([, b]) => b.medium === 'tv' && b.title === 'White Collar')[0]; openItem(id); ui.modal.itab = 'chars'; renderOverlay(); });
  await page.waitForTimeout(300);
  const tabBtn = await page.$('[data-act="itab"][data-k="chars"], [data-k="chars"][data-act*="tab"]'); if (tabBtn) await tabBtn.click(); await page.waitForTimeout(200);
  const load = await page.$('[data-act="cast-load"]'); if (load){ await load.click(); await page.waitForTimeout(2500); }
  const b2 = await page.$('[data-act="cast-tolist"]'); ok('cast → list button', !!b2);
  if (b2){ await b2.click(); await page.waitForTimeout(500); await page.screenshot({ path: ENV.OUT + `/s_castlist_${W}.png` }); await page.click('[data-act="cl-add"]'); await page.waitForTimeout(300);
    ok('ranked list of characters made', await ev(() => meta.lists.some(l => l.kind === 'tier' && l.what === 'chars' && l.rows[0].ids.length > 0))); }
  // castSplit
  ok('cast split', await ev(() => JSON.stringify(castSplit([{ name: 'Homer Simpson / Grampa (voice)', va: 'Dan', image: 'x' }, { name: 'Marge Simpson (voice)', va: 'Julie' }]).map(c => c.name)) === '["Homer Simpson","Grampa","Marge Simpson"]'));
  // game boxes
  await ev(() => { closeModal(); setMode('games'); goTab('library'); mode = curMode(); ui.view = 'cover'; curMode().view = 'cover'; renderMain(); }); await page.waitForTimeout(500);
  ok('game box shapes', await ev(() => document.querySelectorAll('.libbody .gbox').length > 3), await ev(() => document.querySelectorAll('.libbody .gbox').length + ''));
  await page.screenshot({ path: ENV.OUT + `/s_boxes_${W}.png` });
  ok('no page errors', !errs.length, errs.slice(0, 3).join(' / '));
  await browser.close();
})();
