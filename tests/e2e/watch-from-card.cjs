// Watch from a card: open something in your library, press Watch, and it plays (the same as picking it in Watch's search).
// Tried for a show in the middle, one you've finished, one you haven't started, a combined show, a TV show and a film.
const fs = require('fs'), http = require('http'); const ENV = require('./env.cjs');
const { chromium } = require('playwright'); const { setup } = require('./mocks.cjs');
const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
(async () => {
  const file = fs.readFileSync(ENV.FIX + '/videos/Bungo Stray Dogs/Bungo Stray Dogs S01E01.webm');
  const srv = http.createServer((req, res) => { const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || ''), s = m && m[1] ? +m[1] : 0, e = m && m[2] ? Math.min(+m[2], file.length - 1) : file.length - 1;
    res.writeHead(m ? 206 : 200, { 'content-type': 'video/webm', 'accept-ranges': 'bytes', 'access-control-allow-origin': '*', 'content-length': e - s + 1, ...(m ? { 'content-range': `bytes ${s}-${e}/${file.length}` } : {}) }); res.end(file.subarray(s, e + 1)); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const U = p => `http://127.0.0.1:${srv.address().port}/${p}`;
  const b = await chromium.launch({ ...ENV.launch, args: [...((ENV.launch || {}).args || []), '--autoplay-policy=no-user-gesture-required'] }), c = await b.newContext({ viewport: { width: 1400, height: 900 } }); await setup(c);
  const p = await c.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); const ev = (f, a) => p.evaluate(f, a);
  await p.goto(ENV.APP); await p.waitForTimeout(800); await p.fill('#wl-name', 'T'); await p.click('[data-act="welcome-done"]');
  const has = JSON.stringify({ id: 'has-it', name: 'Has it', permissions: ['watch.sources'], code: `univerlist.provide('watch.sources', ctx => ctx.title ? [{ name: 'Mine', url: '${U('a.webm')}?' + encodeURIComponent(ctx.title + '|' + ctx.season + '|' + (ctx.episode == null ? 'film' : ctx.episode)) }] : []);` });
  await ev(t => extInstall(new File([t], 'has.json', { type: 'application/json' })), has);
  await p.waitForFunction(() => [...EXT.frames.values()].some(F => F.jobs.has('watch.sources')), null, { timeout: 8000 });
  const ids = await ev(() => { meta.settings.autoCombine = false; return {
    mid: addItem({ medium: 'anime', kind: 'TV', title: 'Death Note', ext: { anilist: 3 }, total: 12, prog: 4, status: 'active' }),
    done: addItem({ medium: 'anime', kind: 'TV', title: 'Code Geass', ext: { anilist: 5 }, total: 12, prog: 12, status: 'done' }),
    want: addItem({ medium: 'anime', kind: 'TV', title: 'One Piece', ext: { anilist: 4 }, total: 12, status: 'want' }),
    tv: addItem({ medium: 'tv', title: 'Breaking Bad', year: 2008, status: 'want' }),
    film: addItem({ medium: 'film', title: 'Heat', year: 1995, status: 'want' }) }; });
  const playing = async (ms = 10000) => { const end = Date.now() + ms; let s; do { s = await ev(() => { const v = document.querySelector('#cinema video'); return { src: v ? decodeURIComponent(v.src) : '', loading: !!(W.player && W.player.loading), page: ui.page, t: v ? v.currentTime : 0, paused: v ? v.paused : null }; }); if (/a\.webm/.test(s.src) && s.paused === false) return s; await p.waitForTimeout(200); } while (Date.now() < end); return s; };
  for (const [k, id] of Object.entries(ids)){
    await ev(() => { W.player = null; renderPlayer(); ui.page = 'profile'; ui.tab = 'library'; render(); });
    await ev(i => openItem(i), id); await p.waitForSelector('#overlay .playbtn[data-act="watch-open"]');
    await p.click('#overlay .playbtn[data-act="watch-open"]');
    const s = await playing();
    ok(`${k}: Watch on its card starts playing`, /a\.webm/.test(s.src) && s.paused === false, JSON.stringify(s));
  }
  // and from the right-click menu on a cover
  await ev(() => { W.player = null; renderPlayer(); ui.page = 'profile'; ui.tab = 'library'; render(); });
  await ev(i => { openCtx(i, 200, 200); }, ids.mid); await p.waitForTimeout(150);
  await p.click('#ctx [data-act="watch-open"]'); let s = await playing();
  ok('from the right-click menu too', /a\.webm/.test(s.src) && s.paused === false, JSON.stringify(s));
  // and from a cover on Watch's own page ("Carry on")
  await ev(() => { W.player = null; renderPlayer(); meta.settings.stageCovers = true; ui.page = 'watch'; W.view = 'home'; W.q = ''; render(); }); await p.waitForTimeout(200);
  if (await p.$(`.wtile[data-act="watch-item"][data-id="${ids.mid}"]`)){ await p.click(`.wtile[data-act="watch-item"][data-id="${ids.mid}"]`); s = await playing(); ok('from a cover on the Watch page', /a\.webm/.test(s.src) && s.paused === false, JSON.stringify(s)); }
  else ok('from a cover on the Watch page', false, 'no tile');
  // every name the show goes by reaches the extension
  const names = await ev(async () => { const id = addItem({ medium: 'anime', kind: 'TV', title: 'Shingeki no Kyojin', alt: { en: 'Attack on Titan', romaji: 'Shingeki no Kyojin' }, ext: { anilist: 16498 }, total: 25, status: 'active', prog: 1 });
    let got = null; const real = extCall; extCall = async (i, job, args, ms) => { if (job === 'watch.sources') got = args[0].titles; return real(i, job, args, ms); };
    watchFromItem(id); for (let i = 0; i < 40 && !got; i++) await new Promise(r => setTimeout(r, 100)); extCall = real; return got; });
  ok('the extension gets every name (romaji and English)', Array.isArray(names) && names.includes('Attack on Titan') && names.includes('Shingeki no Kyojin'), JSON.stringify(names));
  ok('no page errors', !errs.length, errs.slice(0, 3).join(' / '));
  await b.close(); srv.close(); process.exit(0);
})();
