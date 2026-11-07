// Getting around: Watch & read is its own space (its own look; [ and ] switch Watch ⇄ Read and never leave it), Escape climbs one
// level at a time and stops at Watch's own home, and Settings goes back to exactly where you opened it from (Escape, ✕ or the logo).
const ENV = require('./env.cjs');
const { chromium } = require('playwright'); const { setup } = require('./mocks.cjs');
const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
(async () => {
  const b = await chromium.launch(ENV.launch), c = await b.newContext({ viewport: { width: 1400, height: 900 } }); await setup(c);
  const p = await c.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); const ev = (f, a) => p.evaluate(f, a);
  await p.goto(ENV.APP); await p.waitForTimeout(800); await p.fill('#wl-name', 'T'); await p.click('[data-act="welcome-done"]');
  const bg = () => ev(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  const st = () => ev(() => ({ page: ui.page, mode: ui.mode, tab: ui.tab, view: W.view, show: W.show && W.show.title, player: !!W.player, modal: ui.modal && ui.modal.kind }));
  const key = async k => { await p.keyboard.press(k); await p.waitForTimeout(250); };
  // a mode with a look of its own, different from the hub's
  const other = await ev(() => { const M = allModes(), hub = resolveTheme((modeById('universal') || M[0]).theme).bg; const m = M.find(x => x.id !== 'universal' && resolveTheme(x.theme).bg !== hub); return m && m.id; });
  if (!other) { console.log('skip  no mode with its own look'); process.exit(0); }
  await ev(id => setMode(id), other); await p.waitForTimeout(300);
  const modeBg = await bg(), hubBg = await ev(() => stageLook() === 'black' ? STAGE_BLACK().bg : resolveTheme(stageLook()).bg);   // Watch & read's own look (Black unless you pick one)
  ok('a mode has its own look', modeBg.toLowerCase() === (await ev(() => resolveTheme(curMode().theme).bg)).toLowerCase(), modeBg);
  await ev(() => { ui.tab = 'library'; render(); });

  // ---- Watch & read is its own space ----
  await ev(() => document.querySelector('[data-act="go-stage"]').click()); await p.waitForTimeout(300);
  ok('Watch uses its own look, not the mode you came from', (await bg()).toLowerCase() === hubBg.toLowerCase() && (await bg()).toLowerCase() !== modeBg.toLowerCase(), `${await bg()} (mode: ${modeBg})`);
  await key(']'); let s = await st();
  ok('] goes to Read, staying in Watch & read', s.page === 'read' && s.mode === other, JSON.stringify(s));
  ok('…with the same look', (await bg()).toLowerCase() === hubBg.toLowerCase());
  await key('['); s = await st(); ok('[ comes back to Watch', s.page === 'watch' && s.mode === other, JSON.stringify(s));
  // a show, its player
  await ev(() => watchOpen({ medium: 'anime', title: 'Death Note', ext: { anilist: 3 }, total: 12 })); await p.waitForFunction(() => W.player && !W.player.loading, null, { timeout: 8000 });
  await key(']'); s = await st(); ok('] with the player open does nothing (no jumping out mid-show)', s.page === 'watch' && s.player && s.mode === other, JSON.stringify(s));
  // a dialog over the player gets Escape first
  await ev(() => openModal('seriesservers', {})); await p.waitForTimeout(200); await key('Escape'); s = await st();
  ok('Escape closes a dialog over the player, not the player', !s.modal && s.player, JSON.stringify(s));
  // Escape climbs one level at a time
  await key('Escape'); s = await st(); ok('Escape: player → the show', s.page === 'watch' && !s.player && s.view === 'show' && s.show === 'Death Note', JSON.stringify(s));
  await key('Escape'); s = await st(); ok('Escape: the show → Watch home', s.page === 'watch' && s.view === 'home' && !s.show, JSON.stringify(s));
  await key('Escape'); s = await st(); ok("Escape on Watch home stays in Watch (it isn't inside the hub)", s.page === 'watch' && s.mode === other, JSON.stringify(s));

  // ---- Settings opened while watching isn't hidden under the player ----
  await ev(() => watchOpen({ medium: 'anime', title: 'Death Note', ext: { anilist: 3 }, total: 12 })); await p.waitForFunction(() => W.player && !W.player.loading, null, { timeout: 8000 });
  await key(','); s = await st();
  ok('Settings from the player: the player steps aside so Settings shows', s.page === 'settings' && !s.player && !(await ev(() => !!document.querySelector('#cinema'))), JSON.stringify(s));
  await key('Escape'); s = await st(); ok('…and Escape comes back to the show', s.page === 'watch' && s.view === 'show' && s.show === 'Death Note', JSON.stringify(s));
  await ev(() => { W.view = 'home'; W.show = null; renderMain(); });
  // ---- Settings goes back to where you were ----
  await ev(() => watchOpen({ medium: 'anime', title: 'Death Note', ext: { anilist: 3 }, total: 12 }, { play: false })); await p.waitForTimeout(500);
  await ev(() => goSettings()); await p.waitForTimeout(200);
  ok('Settings opened from Watch keeps the Watch look', (await bg()).toLowerCase() === hubBg.toLowerCase());
  await key('Escape'); s = await st(); ok('Escape in Settings → back to the same show in Watch', s.page === 'watch' && s.view === 'show' && s.show === 'Death Note', JSON.stringify(s));
  await ev(() => goSettings()); await p.waitForTimeout(200); await p.click('#top .brand'); await p.waitForTimeout(200); s = await st();
  ok('the app name in Settings → back to Watch too', s.page === 'watch' && s.show === 'Death Note', JSON.stringify(s));
  await p.click('[data-act="stage-switch"][data-k="read"], [data-act="go-read"]').catch(async () => { await key(']'); });
  await ev(() => { if (W.view === 'show'){ W.view = 'home'; W.show = null; } ui.page = 'read'; render(); });
  await ev(() => goSettings()); await p.waitForTimeout(200); await key('Escape'); s = await st();
  ok('Settings opened from Read → back to Read (not the library)', s.page === 'read', JSON.stringify(s));
  // from a mode's library
  await ev(id => { ui.page = 'profile'; setMode(id, { stay: true }); ui.page = 'profile'; ui.tab = 'library'; render(); }, other); await p.waitForTimeout(300);
  ok('leaving Watch & read brings back the mode\'s own look', (await bg()).toLowerCase() === modeBg.toLowerCase(), await bg());
  await ev(() => goSettings('keys')); await p.waitForTimeout(200); await p.click('header .brand, .brand'); await p.waitForTimeout(200); s = await st();
  ok("the logo in Settings → back to the mode's library you were on", s.page === 'profile' && s.mode === other && s.tab === 'library', JSON.stringify(s));
  await ev(() => goSettings()); await p.waitForTimeout(150); await p.fill('#set-q', 'theme'); await p.waitForTimeout(150); await key('Escape'); s = await st();
  ok('Escape in the settings search clears it first', s.page === 'settings' && (await ev(() => !ui.setQ)), JSON.stringify(s));
  await p.locator('#set-q').blur(); await key('Escape'); s = await st(); ok('…then closes Settings', s.page === 'profile' && s.tab === 'library', JSON.stringify(s));
  // outside Watch & read, [ and ] still move between modes
  const before = await ev(() => ui.mode); await key(']'); ok('in the library, ] still moves to the next mode', (await ev(() => ui.mode)) !== before);

  // ---- picking Watch's look (⋯ on the player page, or Settings) keeps it whichever mode you came from ----
  await ev(() => { meta.settings.stageTheme = 'galaxy'; ui.page = 'watch'; render(); }); await p.waitForTimeout(200);
  const gal = await ev(() => resolveTheme('galaxy').bg);
  ok('Watch & read can wear a theme of your choosing', (await bg()).toLowerCase() === gal.toLowerCase(), await bg());
  await key('['); await key('['); ok('…and keeps it through [ and ]', (await bg()).toLowerCase() === gal.toLowerCase() && (await ev(() => ui.page)) === 'watch');
  ok('no page errors', !errs.length, errs.slice(0, 3).join(' / '));
  await b.close(); process.exit(0);
})();
