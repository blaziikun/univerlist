const ENV = require('./env.cjs');
ENV.needExport();
const { chromium } = require('playwright'); const { setup } = require('./mocks.cjs');
const D = __dirname, ZIP = ENV.EXPORT, W = +(process.argv[2] || 1440);
const H = { 'access-control-allow-origin': '*' };
const art = url => { let h = 0; for (const c of url) h = (h * 31 + c.charCodeAt(0)) >>> 0; const a = h % 360; return `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="650"><rect width="100%" height="100%" fill="hsl(${a},45%,35%)"/></svg>`; };
(async () => {
  const browser = await chromium.launch(ENV.launch);
  const ctx = await browser.newContext({ viewport: { width: W, height: W < 500 ? 844 : 900 } }); await setup(ctx);
  await ctx.route(/(mzstatic|images\.igdb|steamstatic)/, r => r.fulfill({ status: 200, contentType: 'image/svg+xml', headers: H, body: art(r.request().url()) }));
  const page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message));
  const ev = (f, a) => page.evaluate(f, a), ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
  await page.goto(ENV.APP); await page.waitForTimeout(1000); await page.fill('#wl-name', 'Sam'); await page.click('[data-act="welcome-done"]');
  await page.setInputFiles('#file-import', ZIP); await page.waitForSelector('[data-act="import-replace"]'); await page.click('[data-act="import-replace"]'); await page.waitForTimeout(3000);
  // library
  const t0 = Date.now(); await ev(() => { setMode('universal'); goTab('library'); }); ok('hub library fast', Date.now() - t0 < 1500, (Date.now() - t0) + 'ms');
  ok('no status chips row', !(await page.$('.lb-scope')));
  ok('genres split', await ev(() => [...items.values()].filter(b => (b.genres || []).some(g => /Female|Urban|Tomboy/.test(g))).length === 0));
  await page.screenshot({ path: ENV.OUT + `/s_lib_${W}.png` });
  // ⋯ popover above cards
  await page.click('.lb-more'); await page.waitForTimeout(200);
  ok('popover on top', await ev(() => { const p = document.querySelector('.popbody'); const r = p.getBoundingClientRect(); const el = document.elementFromPoint(r.left + 20, r.bottom - 10); return p.contains(el); }));
  await page.screenshot({ path: ENV.OUT + `/s_pop_${W}.png` });
  await ev(() => { ui.pop = null; renderMain(); });
  // advanced filter with a rule
  await ev(() => { ui.filterOpen = true; ui.filtAdv = true; ui.filt = { ...FILT_EMPTY(), rules: [{ f: 'score', op: 'ge', v: '9' }] }; renderMain(); });
  const n9 = await ev(() => libraryList().length), all9 = await ev(() => modeItems().filter(b => b.rating >= 9).length);
  ok('rule filter', n9 === all9 && n9 > 0, n9 + ' vs ' + all9);
  await page.screenshot({ path: ENV.OUT + `/s_filter_${W}.png` });
  await ev(() => { ui.filterOpen = false; ui.filt = FILT_EMPTY(); renderMain(); });
  // box select
  if (W > 800){ const r = await ev(() => { const a = [...document.querySelectorAll('.libbody [data-oid]')].slice(0, 3).map(x => x.getBoundingClientRect()); const body = document.querySelector('.libbody').getBoundingClientRect(); return { x: body.left - 14, y: a[0].top - 4, x2: a[2].right - 10, y2: a[2].bottom - 10 }; });
    await page.mouse.move(r.x, r.y); await page.mouse.down(); await page.mouse.move(r.x + 40, r.y + 40, { steps: 4 }); await page.mouse.move(r.x2, r.y2, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(200);
    ok('box select', await ev(() => ui.selecting && ui.sel.size >= 2), await ev(() => ui.sel.size + ''));
    await page.screenshot({ path: ENV.OUT + `/s_sel_${W}.png` });
    await ev(() => { ui.selecting = false; ui.sel.clear(); renderMain(); }); }
  // combine Little Busters
  const lb = await ev(() => { const L = [...items.entries()].filter(([, b]) => /^Little Busters/.test(b.title) && !b.partOf).map(([id]) => id); return L; });
  const keep = await ev(L => combineItems(L), lb);
  ok('combine', !!keep && await ev(k => partsOf(items.get(k)).length, keep) === lb.length - 1, lb.length + ' parts');
  ok('parts hidden from list', await ev(L => !modeItems().some(b => L.slice(1).includes(b.id) && b.partOf), lb));
  await ev(k => openItem(k), keep); await page.waitForTimeout(300);
  await page.screenshot({ path: ENV.OUT + `/s_parts_${W}.png` });
  await ev(k => { splitPart(k, null); closeModal(); }, keep);
  ok('split', await ev(L => L.every(id => !items.get(id).partOf), lb));
  // move to mode
  const fid = await ev(() => [...items.entries()].find(([, b]) => b.medium === 'tv')[0]);
  await ev(id => moveToMode([id], 'animanga'), fid);
  ok('move to mode', await ev(id => inMode(items.get(id), modeById('animanga')) && !inMode(items.get(id), modeById('screen')) && inMode(items.get(id), modeById('universal')), fid));
  // search spotlight
  await ev(() => { closeModal(); focusSearch(); }); await page.keyboard.type('Bungo'); await page.waitForTimeout(1500);
  ok('search centred', await ev(() => { const r = document.getElementById('gs').getBoundingClientRect(); return Math.abs((r.left + r.right) / 2 - innerWidth / 2) < 30 && document.body.classList.contains('gs-on'); }));
  await page.screenshot({ path: ENV.OUT + `/s_search_${W}.png` });
  const before = await ev(() => items.size);
  const qa = await page.$('[data-gsq]'); if (qa){ await qa.click(); await page.waitForTimeout(2500); }
  ok('quick add keeps search open', await ev(() => GS.open) && (await ev(() => items.size)) === before + 1, (await ev(() => items.size)) - before + ' added');
  await page.keyboard.press('Escape'); ok('esc closes', !(await ev(() => GS.open)));
  // sidebar
  await ev(() => { meta.layout.side.pinned = true; renderSide(); }); await page.waitForTimeout(300);
  ok('no Continue in sidebar', !(await page.$('#side .scont')));
  await page.screenshot({ path: ENV.OUT + `/s_side_${W}.png` });
  ok('no page errors', !errs.length, errs.slice(0, 3).join(' | ')); await browser.close();
})();
