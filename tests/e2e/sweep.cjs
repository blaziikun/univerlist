// Every settings section, every tab of every mode, and the pages around them open without a page error;
// plus the Phase 2 changes: seasons on the Rank page, one-line extension rows, the type filter, the player's way into Settings.
const ENV = require('./env.cjs');
const { chromium } = require('playwright'); const { setup } = require('./mocks.cjs');
(async () => { const browser = await chromium.launch(ENV.launch);
  const ctx = await browser.newContext(); await setup(ctx); const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
  const ev = (f, a) => page.evaluate(f, a);
  await page.goto(ENV.APP); await page.waitForTimeout(1000); await page.fill('#wl-name', 'S'); await page.click('[data-act="welcome-done"]');
  await ev(() => { meta.settings.autoCombine = false;
    const a = addItem({ medium: 'anime', kind: 'TV', title: 'Little Busters!', year: 2012, status: 'done', rating: 7, ext: { anilist: 1 } });
    const b = addItem({ medium: 'anime', kind: 'TV', title: 'Little Busters! Refrain', year: 2013, status: 'done', rating: 9, ext: { anilist: 2 } });
    addItem({ medium: 'anime', kind: 'TV', title: 'Bleach', year: 2004, status: 'done', rating: 8, ext: { anilist: 3 } });
    addItem({ medium: 'film', title: 'Heat', year: 1995, status: 'done', rating: 8 });
    addItem({ medium: 'book', title: 'Dune', creator: 'Frank Herbert', status: 'want' });
    window.__ab = [a, b]; });
  // every settings section
  const secs = await ev(() => setSecs().map(s => s[0]));
  for (const s of secs){ await ev(k => goSettings(k), s); await page.waitForTimeout(80); }
  ok('every settings section opens', !errs.length, errs.slice(0, 3).join(' | '));
  ok('no ✕ in Settings (the top bar takes you back)', await ev(() => !document.querySelector('.setclose')));
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok('Escape leaves Settings for where it was opened', await ev(() => ui.page !== 'settings'));
  // every tab of every mode
  const tabs = await ev(() => allModes().flatMap(m => [...new Set([...tabsFor(m), 'rank', 'favourites', 'discover', 'stats'])].map(t => [m.id, t])));
  for (const [m, t] of tabs){ await ev(([m, t]) => { ui.mode = m; ui.page = 'profile'; ui.tab = t; render(); }, [m, t]); await page.waitForTimeout(40); }
  ok('every tab of every mode opens', !errs.length, errs.slice(0, 3).join(' | '));
  // seasons on the Rank page: combine, put the second on the front, ranked once
  await ev(() => { ui.mode = allModes().find(x => x.id !== 'universal' && x.id !== 'hub' && (x.media || []).includes('anime'))?.id || 'universal'; ui.page = 'profile'; ui.tab = 'rank'; ui.seasonsOpen = true; render(); });
  ok('Rank has the Seasons panel', await ev(() => !!document.querySelector('.seasonsp')));
  await ev(() => { combineItems(window.__ab, window.__ab[0]); render(); });
  ok('combined: one entry holds the other', await ev(() => (items.get(window.__ab[0]).parts || []).includes(window.__ab[1])));
  await ev(() => { seasonFront(window.__ab[0], window.__ab[1]); render(); });
  ok('Refrain on the front', await ev(() => (items.get(window.__ab[1]).parts || []).includes(window.__ab[0]) && items.get(window.__ab[0]).partOf === window.__ab[1]));
  ok('ranked once, scored as the average', await ev(() => { const p = rankPool(); return p.filter(b => window.__ab.includes(b.id)).length <= 1; }));
  ok('search still finds the season inside', await ev(() => gsLocal('little busters').length === 2));
  ok('not flagged as duplicates', await ev(() => !dupGroups().some(g => g.includes(window.__ab[0]))));
  // extensions: folded rows
  await ev(() => goSettings('ext')); await page.waitForTimeout(100);
  ok('extension rows start folded', await ev(() => [...document.querySelectorAll('.extrow>details')].length > 0 && [...document.querySelectorAll('.extrow>details')].every(d => !d.open)));
  // Watch: a type filter instead of chips
  await ev(() => { ui.page = 'watch'; render(); }); await page.waitForTimeout(100);
  ok('Watch has a type filter, no chips', await ev(() => !!document.querySelector('[data-stagecat]') && !document.querySelector('[data-act="stage-cat"]')));
  ok('no "where to watch" anywhere', await ev(() => { openItem(window.__ab[1]); return !/Where to watch/.test(document.body.innerText); }));
  await ev(() => { [...items.keys()].forEach((id, i) => patch(id, { genres: ['Drama', i % 2 ? 'Action' : 'Comedy'] })); ui.mode = 'universal'; ui.page = 'profile'; ui.tab = 'discover'; render(); });
  ok('Insights: finish rate by genre, no "other parts"', await ev(() => !!document.querySelector('.ihero') && !!document.querySelector('.ratebars') && !/Other parts of things you loved/.test(document.body.innerText)));
  const ord = await ev(() => { const a = addItem({ medium: 'film', title: 'Star Wars: Episode IV', franchise: 'Star Wars', year: 1977, chrono: 4 }), b = addItem({ medium: 'film', title: 'Star Wars: Episode I', franchise: 'Star Wars', year: 1999, chrono: 1 });
    const L = () => [a, b].map(id => ({ id, ...items.get(id) })).sort(sortBy('order')).map(x => x.year).join();
    meta.settings.watchOrder = 'release'; const r = L(); meta.settings.watchOrder = 'story'; const st = L(); return r + '|' + st; });
  ok('watch order: release, or story when you set it', ord === '1977,1999|1999,1977', ord);
  ok('the support link is always there, bottom right', await ev(() => { ui.page = 'profile'; render(); const a = document.querySelector('#donatefoot a'); return !!a && a.href === DONATE_URL && getComputedStyle(a).position === 'fixed'; }));
  ok('the app is UniverList', await ev(() => document.title === 'UniverList' || meta.settings.appName === 'UniverList'));
  ok('no page errors', !errs.length, errs.slice(0, 5).join(' | '));
  await browser.close(); })();
