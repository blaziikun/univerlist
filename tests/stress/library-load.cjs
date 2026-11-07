// Stress: your real library (UL_EXPORT). How long the main pages take to draw, opening a 367-episode show, and what playing does
// to the page: how often it redraws and whether anything blocks it for long.
const fs = require('fs'), http = require('http'), path = require('path');
const ENV = require('../e2e/env.cjs'); ENV.needExport();
const { chromium } = require('playwright'); const { setup } = require('../e2e/mocks.cjs');
const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
(async () => {
  const file = fs.readFileSync(ENV.FIX + '/videos/Bungo Stray Dogs/Bungo Stray Dogs S01E01.webm');
  const srv = http.createServer((req, res) => { const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || ''), s = m && m[1] ? +m[1] : 0, e = m && m[2] ? Math.min(+m[2], file.length - 1) : file.length - 1; res.writeHead(m ? 206 : 200, { 'content-type': 'video/webm', 'accept-ranges': 'bytes', 'content-length': e - s + 1, ...(m ? { 'content-range': `bytes ${s}-${e}/${file.length}` } : {}) }); res.end(file.subarray(s, e + 1)); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const U = `http://127.0.0.1:${srv.address().port}/a.webm`;
  const b = await chromium.launch({ ...ENV.launch, args: ['--autoplay-policy=no-user-gesture-required'] }), c = await b.newContext({ viewport: { width: 1440, height: 900 } }); await setup(c);
  const p = await c.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); const ev = (f, a) => p.evaluate(f, a);
  await p.goto(ENV.APP); await p.waitForTimeout(800); await p.fill('#wl-name', 'T'); await p.click('[data-act="welcome-done"]');
  await p.setInputFiles('#file-import', ENV.EXPORT); await p.waitForSelector('[data-act="import-replace"]'); if (await p.$('#imp-keypass')) await p.fill('#imp-keypass', ''); await p.click('[data-act="import-replace"]'); await p.waitForTimeout(3000);
  const n = await ev(() => items.size); ok('your library loaded', n > 1000, n + ' items');
  await ev(() => { window.__long = []; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: false }); });
  const time = async (label, fn, limit) => { const ms = await ev(fn); ok(`${label} in under ${limit} ms`, ms < limit, Math.round(ms) + ' ms'); return ms; };
  await time('the library page draws', () => { const t = performance.now(); ui.page = 'profile'; ui.tab = 'library'; render(); return performance.now() - t; }, 400);
  await ev(() => { ui.page = 'watch'; W.view = 'home'; render(); ui.page = 'profile'; render(); });   // the first visit also switches the look
  await time('Watch home draws', () => { const t = performance.now(); ui.page = 'watch'; W.view = 'home'; render(); return performance.now() - t; }, 150);
  await time('Read home draws', () => { const t = performance.now(); ui.page = 'read'; RD.item = null; render(); return performance.now() - t; }, 300);
  await time('Settings draws', () => { const t = performance.now(); goSettings('general'); return performance.now() - t; }, 300);
  const bl = await ev(() => [...items.entries()].find(([, b]) => b.title === 'Bleach' && b.medium === 'anime')[0]);
  await ev(() => { ui.page = 'watch'; render(); });
  const t0 = Date.now(); await ev(i => watchFromItem(i), bl); await p.waitForFunction(() => document.querySelectorAll('#cinema .cin-side [data-k]').length > 300 && W.player && !W.player.loading, null, { timeout: 15000 });
  ok('Bleach opens with all its episodes listed in under 1.5 s', Date.now() - t0 < 1500, (Date.now() - t0) + ' ms, ' + await ev(() => document.querySelectorAll('#cinema .cin-side [data-k]').length) + ' episodes beside the player');
  await ev(u => { W.player.srcs = [{ name: 'Server', url: u }]; W.player.k = 0; renderPlayer(); }, U); await p.waitForFunction(() => { const v = document.querySelector('#cinema video'); return v && v.readyState >= 2; });
  await ev(() => { window.__renders = 0; const o = renderMain; window.renderMain = function(){ const r = o.apply(this, arguments); if (!W.pageStale) window.__renders++; return r; }; window.__long = []; const v = document.querySelector('#cinema video'); v.loop = true; v.play(); });
  for (let i = 0; i < 10; i++){ await p.mouse.move(300 + i * 30, 300); await p.waitForTimeout(800); }
  const r = await ev(() => ({ renders: window.__renders, long: window.__long, t: document.querySelector('#cinema video').currentTime }));
  ok('8 s of playing: the page behind it is not redrawn', r.renders <= 1, JSON.stringify(r));
  ok('…and nothing blocks the page for more than 100 ms', !r.long.some(x => x > 100), JSON.stringify(r.long));
  // switching episodes quickly: the last one wins, nothing from the earlier ones turns up
  await ev(u => { for (let i = 0; i < 8; i++) watchStep(1); }, U); await p.waitForTimeout(1500);
  const e = await ev(() => ({ e: W.player && W.player.e, srcs: W.player && W.player.srcs.length }));
  ok('eight quick "next"s land on episode 9', e.e === 9, JSON.stringify(e));
  ok('no page errors', !errs.length, errs.slice(0, 3).join(' / '));
  await b.close(); srv.close(); process.exit(0);
})();
