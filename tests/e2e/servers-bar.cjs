// The player's one Servers bar (icon · 1 2 3 · +), its card button, and finished shows staying finished.
const fs = require('fs'), http = require('http');
const ENV = require('./env.cjs');
const { chromium } = require('playwright'); const { setup } = require('./mocks.cjs');
const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
(async () => {
  const file = fs.readFileSync(ENV.FIX + '/videos/Bungo Stray Dogs/Bungo Stray Dogs S01E01.webm');
  const srv = http.createServer((req, res) => { const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || ''), s = m && m[1] ? +m[1] : 0, e = m && m[2] ? Math.min(+m[2], file.length - 1) : file.length - 1;
    res.writeHead(m ? 206 : 200, { 'content-type': 'video/webm', 'accept-ranges': 'bytes', 'access-control-allow-origin': '*', 'content-length': e - s + 1, ...(m ? { 'content-range': `bytes ${s}-${e}/${file.length}` } : {}) }); res.end(file.subarray(s, e + 1)); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const U = p => `http://127.0.0.1:${srv.address().port}/${p}`;
  const b = await chromium.launch({ ...ENV.launch, args: ['--autoplay-policy=no-user-gesture-required'] }), c = await b.newContext({ viewport: { width: 1400, height: 900 } }); await setup(c);
  const p = await c.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); const ev = (f, a) => p.evaluate(f, a);
  await p.goto(ENV.APP); await p.waitForTimeout(800); await p.fill('#wl-name', 'T'); await p.click('[data-act="welcome-done"]');
  const play = (opts) => ev(([a, o]) => { const id = o.id; meta.settings.player = { ...PS(), autoNext: false };
    ui.page = 'watch'; render(); W.show = { medium: 'anime', title: o.title, year: 2020, ext: {} }; W.seasons = [{ n: 1, label: o.title, member: id, eps: [1, 2, 3].map(e => ({ e, title: 'Ep ' + e })) }]; W.si = 0; W.view = 'show';
    W.player = { title: o.title + ' · Episode ' + o.e, show: o.title, film: false, si: 0, e: o.e, srcs: [{ name: 'A very long file name, season one, episode one [1080p].mkv', url: a, how: 'original', owner: 'Home server' }, { name: 'Second copy', url: a + '?b=1' }], k: 0, marked: epWatched(0, o.e) }; renderPlayer(); }, [U('a.webm'), opts]);
  const ready = () => p.waitForFunction(() => { const v = document.querySelector('#cinema video'); return v && v.readyState >= 2; }, null, { timeout: 15000 });
  const id = await ev(() => addItem({ medium: 'anime', title: 'Bar Show', status: 'active', total: 3, prog: 0 }));
  await play({ id, title: 'Bar Show', e: 1 }); await ready();

  // ---- the bar ----
  const bar = await ev(() => { const s = document.querySelector('#cinema .cin-srv'); return s && { icon: !!s.querySelector('.srv.ico svg'), chips: [...s.querySelectorAll('[data-act="cin-src-pick"]')].map(x => x.textContent.trim()), on: (s.querySelector('.srv.on') || {}).textContent, add: !!s.querySelector('[data-act="ss-open"]'), inHead: !!s.closest('.cin-head, .cin-top') }; });
  ok('one bar at the top: icon, Server 1 2, +', bar && bar.icon && bar.chips.join() === '1,2' && bar.on === '1' && bar.add && bar.inHead, JSON.stringify(bar));
  ok('no separate "Servers" button', await ev(() => ![...document.querySelectorAll('#cinema button')].some(x => x.textContent.trim().startsWith('Servers'))));
  ok("the long file name isn't shown under the player", await ev(() => !/very long file name/.test((document.querySelector('#cinema .cin-under') || document.querySelector('#cinema .cin-bot') || {}).textContent || '')));
  ok('…but hovering a server says what it is', await ev(() => /very long file name/.test(document.querySelector('#cinema [data-act="cin-src-pick"][data-k="0"]').title)));
  await p.click('#cinema [data-act="cin-src-pick"][data-k="1"]'); await ready();
  ok('Server 2 switches to it', (await ev(() => W.player.k)) === 1 && (await ev(() => document.querySelector('#cinema video').src)).includes('b=1'));
  await p.click('#cinema .cin-srv .srv.ico');
  ok('the icon lists them as Server 1 and Server 2, with their names', await ev(() => { const r = [...document.querySelectorAll('#cinema .srcrow')].map(x => x.textContent); return r.length === 2 && /Server 1/.test(r[0]) && /very long/.test(r[0]) && /Server 2/.test(r[1]); }));
  await p.click('#cinema .cin-srv .srv.ico');
  await p.click('#cinema .cin-srv [data-act="ss-open"]'); await p.waitForTimeout(300);
  ok('+ opens "add a server for this series", on top of the player', await ev(() => { const m = document.querySelector('#overlay .modal #ss-in'); if (!m) return false; const r = m.getBoundingClientRect(), top = document.elementFromPoint(r.x + 10, r.y + 10); return !!(top && top.closest('.modal')); }));
  await ev(() => closeModal());
  // a server arriving later joins the bar without restarting the video
  await ev(() => { const v = document.querySelector('#cinema video'); v._mark = 1; W.player.looking = 1; srvRefresh(W.player); });
  ok('while still checking, the bar says so', await ev(() => !!document.querySelector('#cinema .cin-srv .srv.wait')));
  await ev(a => { W.player.looking = 0; W.player.srcs.push({ name: 'Late one', url: a + '?c=1' }); srvRefresh(W.player); }, U('a.webm'));
  ok('a late server joins as 3 without restarting what plays', await ev(() => document.querySelectorAll('#cinema [data-act="cin-src-pick"]').length === 3 && document.querySelector('#cinema video')._mark === 1 && !document.querySelector('#cinema .srv.wait')));

  // ---- its card ----
  await p.click('#cinema .cin-head [data-act="open"]'); await p.waitForTimeout(400);
  ok('"Open its card" opens this show\'s card, on top', await ev(i => ui.modal && ui.modal.kind === 'item' && ui.modal.id === i && (() => { const m = document.querySelector('#overlay .modal'), r = m.getBoundingClientRect(), top = document.elementFromPoint(r.x + r.width / 2, r.y + 20); return !!(top && top.closest('.modal')); })(), id));
  await ev(() => closeModal());

  // ---- finished stays finished ----
  const did = await ev(() => addItem({ medium: 'anime', title: 'Done Show', status: 'done', total: 3, prog: 3, finishedAt: nowISO() }));
  await play({ id: did, title: 'Done Show', e: 2 }); await ready();
  ok('a finished show shows its episodes as watched', await ev(() => W.player.marked === true));
  await p.click('#cinema [data-act="cin-mark"]'); await p.waitForTimeout(300);
  let st = await ev(i => ({ s: items.get(i).status, prog: items.get(i).prog, toast: (document.querySelector('.toast') || {}).textContent || '' }), did);
  ok('un-ticking an episode keeps it finished, progress untouched', st.s === 'done' && st.prog === 3 && /stays finished/.test(st.toast), JSON.stringify(st));
  await p.click('.toast button'); await p.waitForTimeout(300);
  st = await ev(i => ({ s: items.get(i).status, prog: items.get(i).prog }), did);
  ok('…and "Untick anyway" does it on purpose', st.prog === 1, JSON.stringify(st));
  await ev(i => quietPatch(i, { status: 'done', prog: 3 }), did);
  // watching it again: reaching the last episode counts another time through
  await play({ id: did, title: 'Done Show', e: 3 }); await ready();
  await ev(() => { const v = document.querySelector('#cinema video'); v.currentTime = v.duration * .95; }); await p.waitForTimeout(800);
  st = await ev(i => ({ s: items.get(i).status, repeat: items.get(i).repeat || 0 }), did);
  ok('finishing the last episode again counts as another time through', st.s === 'done' && st.repeat === 1, JSON.stringify(st));
  await play({ id: did, title: 'Done Show', e: 2 }); await ready();
  await ev(() => { const v = document.querySelector('#cinema video'); v.currentTime = v.duration * .95; }); await p.waitForTimeout(800);
  st = await ev(i => ({ s: items.get(i).status, repeat: items.get(i).repeat || 0, prog: items.get(i).prog }), did);
  ok('a middle episode watched again changes nothing', st.s === 'done' && st.repeat === 1 && st.prog === 3, JSON.stringify(st));
  // a show you're watching still moves along
  await play({ id, title: 'Bar Show', e: 2 }); await ready();
  await ev(() => { const v = document.querySelector('#cinema video'); v.currentTime = v.duration * .95; }); await p.waitForTimeout(800);
  ok("a show you're watching moves on to episode 2", await ev(i => items.get(i).prog === 2 && items.get(i).status === 'active', id));

  ok('no page errors', !errs.length, errs.slice(0, 3).join(' / '));
  await b.close(); srv.close(); process.exit(0);
})();
