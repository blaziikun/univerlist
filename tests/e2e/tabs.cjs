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
  // remember tab per mode
  await ev(() => { setMode('universal'); goTab('overview'); setMode('animanga'); goTab('stats'); setMode('novels'); setMode('animanga'); });
  ok('culture back on stats', await ev(() => ui.tab === 'stats'), await ev(() => ui.tab));
  await ev(() => setMode('universal')); ok('hub on overview', await ev(() => ui.tab === 'overview'), await ev(() => ui.tab));
  // tab editor
  await page.click('.tabedit'); await page.waitForTimeout(200);
  await page.screenshot({ path: ENV.OUT + `/s_tabedit_${W}.png` });
  await page.uncheck('#ctx [data-tabon="favourites"]'); await page.waitForTimeout(150);
  ok('removed Favourites from hub', await ev(() => !tabsFor().includes('favourites') && tabsFor(modeById('animanga')).includes('favourites')));
  await page.check('#ctx [data-tabon="diary"]'); await page.waitForTimeout(150);
  ok('added Diary to hub', await ev(() => tabsFor().includes('diary')));
  await page.click('#ctx [data-act="tab-move"][data-k="stats"][data-d="-1"]'); await page.waitForTimeout(150);
  ok('moved Stats earlier', await ev(() => tabsFor().indexOf('stats') < tabsFor().indexOf('library')), await ev(() => tabsFor().join()));
  await page.click('#ctx [data-act="tab-home"][data-k="stats"]'); await page.waitForTimeout(150);
  ok('home tab', await ev(() => curMode().homeTab === 'stats'));
  ok('menu still open', await ev(() => !document.getElementById('ctx').hidden));
  // drag tab in bar
  if (W > 800){ await page.mouse.click(5, 300); await page.dragAndDrop('.ptabs [data-k="discover"]', '.ptabs [data-k="overview"]', { targetPosition: { x: 4, y: 10 } }); await page.waitForTimeout(200);
    ok('drag tab to front', await ev(() => tabsFor()[0] === 'discover'), await ev(() => tabsFor().join())); }
  // refresh keeps place
  await ev(() => { setMode('animanga'); goTab('stats'); }); await ev(() => window.scrollTo(0, 300));
  await page.reload(); await page.waitForTimeout(2500);
  ok('refresh keeps mode+tab', await ev(() => ui.mode === 'animanga' && ui.tab === 'stats' && ui.page === 'profile'), await ev(() => ui.mode + '/' + ui.tab + '/' + ui.page));
  await ev(() => { ui.page = 'watch'; render(); }); await page.reload(); await page.waitForTimeout(2500);
  ok('refresh keeps watch page', await ev(() => ui.page === 'watch'));
  await ev(() => goSettings('library')); await page.waitForTimeout(200); await page.screenshot({ path: ENV.OUT + `/s_setlib_${W}.png`, fullPage: true });
  ok('no Tabs row in settings', await ev(() => ![...document.querySelectorAll('.srow b')].some(b => /^Tabs$|Its own tabs/.test(b.textContent))));
  ok('no page errors', !errs.length, errs.slice(0, 3).join(' / '));
  await browser.close();
})();
