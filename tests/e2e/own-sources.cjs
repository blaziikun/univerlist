// Watch plays only your own sources (watch-read/own-sources.js): files on this device, your own network, servers you've
// added yourself, and YouTube. Addresses anywhere else are refused wherever they come in: a pasted link, a link pattern,
// a series' servers, an extension, and the player itself.
const ENV = require('./env.cjs');
const { chromium } = require('playwright'); const { setup } = require('./mocks.cjs');
const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
(async () => {
  const b = await chromium.launch(ENV.launch), c = await b.newContext(); await setup(c);
  const p = await c.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); const ev = (f, a) => p.evaluate(f, a);
  await p.goto(ENV.APP); await p.waitForTimeout(800); await p.fill('#wl-name', 'T'); await p.click('[data-act="welcome-done"]');

  // ----- the rule itself -----
  const yes = ['http://localhost:8080/a.mp4', 'http://127.0.0.1/a.mp4', 'http://192.168.1.20/Show/S01E01.mkv', 'http://10.0.0.5/a.mp4',
    'http://172.20.1.1/a.mp4', 'http://100.101.102.103/a.mp4', 'https://nas.tail1234.ts.net/a.mp4', 'http://nas.local/a.mp4',
    'http://media.home.arpa/a.mp4', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'http://192.168.1.20/{title}/S{s2}E{e2}.mp4',
    'http://[::1]:8096/a.mp4', 'http://[fd7a:115c:a1e0::1]/a.mp4', 'http://[fe80::1]/a.mp4'];
  const no = ['https://example.com/a.mp4', 'http://172.40.1.1/a.mp4', 'http://100.200.1.1/a.mp4', 'ftp://192.168.1.20/a.mp4',
    'javascript:alert(1)', 'https://evil.example/{title}/{episode}.mp4', 'https://localhost.evil.example/a.mp4', 'not a link',
    'https://10.evil.example/a.mp4', 'https://192.168.1.evil.example/a.mp4', 'https://127.0.0.1.evil.example/a.mp4', 'http://[2001:db8::1]/a.mp4'];
  let st = await ev(([yes, no]) => ({ yes: yes.filter(u => !isOwnSource(u)), no: no.filter(u => isOwnSource(u)), file: isOwnSource({ file: new Blob() }) }), [yes, no]);
  ok('your device, your network, Tailscale and YouTube count as yours', !st.yes.length && st.file, st.yes.join(' '));
  ok('anywhere else doesn\'t, however it\'s dressed up', !st.no.length, st.no.join(' '));
  st = await ev(() => { const before = isOwnSource('https://media.example.net/a.mp4'); meta.settings.libs = [{ id: 'l1', kind: 'folder', url: 'https://media.example.net/videos/', on: true }]; return { before, after: isOwnSource('https://media.example.net/b.mp4') }; });
  ok('a server you add yourself counts as yours', !st.before && st.after, JSON.stringify(st));

  // ----- where addresses come in -----
  await ev(() => { addItem({ medium: 'tv', title: 'Severance', status: 'active' }); ui.page = 'watch'; render(); });
  st = await ev(() => {
    // a link pattern and a series' server pointing at the wider web: neither is offered to the player
    meta.settings.servers = [{ name: 'Out there', pattern: 'https://videos.example.org/{title}/{episode}.mp4', on: true }, { name: 'NAS', pattern: 'http://192.168.1.20/{title}/{episode}.mp4', on: true }];
    W.show = { title: 'Severance', medium: 'tv' }; W.seasons = [{ n: 1, eps: [{ e: 1 }] }];
    return sourcesFor(0, 1).map(s => s.name);
  });
  ok('a link pattern to somewhere else is never offered; yours is', st.join() === 'NAS', st.join());
  await ev(() => { meta.settings.servers = []; });

  // the player itself: a source that slipped in is still refused, and says why
  st = await ev(() => {
    W.player = { title: 'X', srcs: [{ name: 'Elsewhere', url: 'https://example.com/a.mp4' }], k: 0, single: true };
    renderPlayer();
    const v = document.querySelector('#cinema video'), note = (document.querySelector('#cinema') || {}).innerText || '';
    return { video: !!(v && v.getAttribute('src')), note: /your own videos/.test(note) };
  });
  ok('the player won\'t load an address that isn\'t yours, and says why', !st.video && st.note, JSON.stringify(st));
  await ev(() => { W.player = null; renderPlayer(); });

  // an extension offering a source from the wider web: dropped; one from your network: kept
  const code = `univerlist.provide("watch.sources", async () => [{ name: "web", url: "https://example.com/a.mp4" }, { name: "home", url: "http://127.0.0.1:9/a.mp4" }]);`;
  await ev(code => extInstall(new File([JSON.stringify({ id: 'two-sources', name: 'Two sources', permissions: ['watch.sources'], code })], 'two.json', { type: 'application/json' })), code);
  await p.waitForFunction(() => [...EXT.frames.values()].some(F => F.jobs.has('watch.sources')), null, { timeout: 10000 }).catch(() => {});
  st = await ev(async () => (await extWatchSources({ title: 'Severance', titles: ['Severance'], episode: 1, season: 1 })).map(s => s.name));
  ok('an extension\'s source from elsewhere is dropped; one from your network is kept', st.join() === 'home', st.join());

  ok('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
})().catch(e => { console.log('FAIL ' + e.message.split('\n')[0]); process.exit(1); });
