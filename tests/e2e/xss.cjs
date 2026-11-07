// Hostile text everywhere a name or note can come from (imports, catalogues, extensions, other people's lists): it shows as
// text on every page and never runs. This is the one-file build, with no security headers, so escaping is all that stops it.
const ENV = require('./env.cjs');
const { chromium } = require('playwright'); const { setup } = require('./mocks.cjs');
const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
const X = `"><img src=x onerror="window.__x=(window.__x||0)+1"><svg onload="window.__x=1">'\``;
(async () => { const b = await chromium.launch(ENV.launch), c = await b.newContext(); await setup(c); const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (f, a) => p.evaluate(f, a);
  await p.goto(ENV.APP); await p.waitForTimeout(800); await p.fill('#wl-name', X); await p.click('[data-act="welcome-done"]');
  await ev(X => {
    meta.profile.bio = X;
    for (const m of ['anime', 'film', 'book', 'game', 'tv', 'manga']) addItem({ medium: m, title: X, creator: X, kind: X, notes: X, about: X, genres: [X, 'Drama'], themes: [X], tags: [X], status: 'done', rating: 7, year: 2001, series: X, franchise: X, favWhy: X, fav: true, cover: 'https://x.test/"><img src=x onerror=window.__x=9>.jpg', streams: [{ site: X, url: 'javascript:window.__x=5' }] });
    meta.lists.push({ id: 'l1', name: X, desc: X, ids: [...items.keys()], notes: {}, created: nowISO() });
    meta.chars.push({ id: 'c1', name: X, why: X, tags: [X], media: [], rank: 1 });
    ensureTag(X);
    const C = ACS(); C.subjects.push({ id: 's-x', name: X, g: X, fields: { [X]: { lvl: 1 } }, order: [X], sources: [{ id: 'q', kind: 'uni', name: X, url: 'javascript:window.__x=7', note: X }], opps: [{ id: 'o', t: X, url: 'javascript:window.__x=8', note: X }] });
    const P = lcNewPath({ name: X, sub: 's-x', uni: X, about: X, method: X }); P.books.push({ id: 'k', t: X, a: X, th: X, st: 'reading', note: X, top: true }); P.modules = [{ id: 'm', name: X, code: X, status: 'taking', topics: [{ t: X, done: false }] }];
  }, X);
  await ev(() => { window.__bad = []; new MutationObserver(() => { for (const a of document.querySelectorAll('a[href^="javascript:" i], img[src="x"], svg[onload], [onerror], [onload]')) window.__bad.push(a.outerHTML.slice(0, 120)); }).observe(document.body, { childList: true, subtree: true }); });
  const pages = [];
  for (const m of await ev(() => allModes().map(x => x.id))) for (const t of ['overview', 'library', 'favourites', 'stats', 'lists', 'discover', 'rank', 'learn', 'curricula', 'diary', 'series', 'quotes', 'seasonal', 'playing']) pages.push(['tab', m, t]);
  for (const [, m, t] of pages){ await ev(([m, t]) => { ui.mode = m; ui.page = 'profile'; ui.tab = t; if (t === 'learn') ui.learnSub = 's-x'; render(); }, [m, t]).catch(e => errs.push(m + '/' + t + ': ' + e.message)); await p.waitForTimeout(30); }
  await ev(() => { ui.pwId = PWS()[0].id; ui.lcOpen = 'm'; setMode('academic'); goTab('learn'); }); await p.waitForTimeout(100);
  for (const s of await ev(() => setSecs().map(x => x[0]))){ await ev(k => goSettings(k), s); await p.waitForTimeout(40); }
  for (const id of await ev(() => [...items.keys()])){ await ev(i => { ui.page = 'profile'; render(); openItem(i); }, id); await p.waitForTimeout(60); await ev(() => closeModal()); }
  await ev(() => { ui.page = 'watch'; render(); }); await p.waitForTimeout(100);
  await ev(X => { const i = document.querySelector('#gq'); if (i){ focusSearch(); i.value = X; i.dispatchEvent(new Event('input', { bubbles: true })); } }, X); await p.waitForTimeout(400);
  const r = await ev(() => ({ bad: [...new Set(window.__bad)].slice(0, 5), x: window.__x || 0, imgs: document.querySelectorAll('img[src="x"]').length, svg: document.querySelectorAll('svg[onload]').length, js: [...document.querySelectorAll('a[href^="javascript:"]')].length }));
  ok('nothing hostile ran', r.x === 0, JSON.stringify(r));
  ok('no injected elements anywhere, on any page along the way', !r.imgs && !r.svg && !r.bad.length, JSON.stringify(r));
  ok('no javascript: links made from data', !r.js, JSON.stringify(r));
  ok('no page errors', !errs.length, errs.slice(0, 4).join(' | '));
  await b.close(); })();
