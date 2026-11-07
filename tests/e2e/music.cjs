// Music: albums are a kind of thing in your library, with their own Music mode (after the Learning Centre; the Hub leaves them to it,
// as it does games). Search finds them on MusicBrainz, adding one brings its tracks and length, and the words fit
// ("Listened", "Plan to listen", the artist). An older library gets the Music mode once. MusicBrainz is faked (mocks.cjs).
const ENV = require('./env.cjs');
const { chromium } = require('playwright'); const { setup } = require('./mocks.cjs');
const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
(async () => { const b = await chromium.launch(ENV.launch), c = await b.newContext({ viewport: { width: 1300, height: 900 } }); await setup(c); const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (f, a) => p.evaluate(f, a);
  await p.goto(ENV.APP); await p.waitForTimeout(800); await p.fill('#wl-name', 'T'); await p.click('[data-act="welcome-done"]');

  let st = await ev(() => ({ modes: meta.modes.map(m => m.id), hub: modeById('universal').match, medium: MEDIA.album && [MEDIA.album.name, MEDIA.album.group, MEDIA.album.unit[1]] }));
  ok('albums are a kind of thing: Music, listened to, counted in tracks', st.medium && st.medium.join() === 'Music,listen,tracks', JSON.stringify(st.medium));
  ok('a Music mode, right after the Learning Centre (the modes you know keep their shortcuts), and the Hub leaves albums to it', st.modes.indexOf('music') === st.modes.indexOf('academic') + 1 && st.hub.includes('!album'), JSON.stringify(st));

  // ----- search, as anywhere: a Music column -----
  await ev(() => focusSearch()); await p.fill('#gq', 'ok computer'); await p.waitForTimeout(3000);
  st = await ev(() => { const col = [...document.querySelectorAll('.gscol')].find(x => /Music/.test((x.querySelector('.gsg') || {}).textContent || '')); return col ? col.innerText : null; });
  ok('search has a Music column with albums from MusicBrainz, artist included', !!st && /OK Computer/.test(st) && /Radiohead/.test(st), (st || '').slice(0, 120));
  await ev(() => closeSearch && closeSearch()).catch(() => {});

  // ----- adding one: its tracks and length come with it -----
  st = await ev(async () => {
    const [hit] = await searchMedium('album', 'ok computer');
    const d = await candidateDetails(hit);
    const id = addItem({ ...d, status: 'done' });
    const it = items.get(id);
    return { id, title: it.title, creator: it.creator, kind: it.kind, year: it.year, total: it.total, runtime: it.runtime, mbid: it.ext.mbid, cover: it.cover, word: statusWord('done', 'album'), want: statusWord('want', 'album'), mins: minutesSpent(it), inMusic: modeItems(modeById('music')).some(x => x.id === id), inHub: modeItems(modeById('universal')).some(x => x.id === id) };
  });
  ok('adding an album brings its artist, year, kind and cover', st.creator === 'Radiohead' && st.year === 1997 && st.kind === 'Album' && /coverartarchive/.test(st.cover) && st.mbid === 'mb-okc', JSON.stringify(st));
  ok('…and its 12 tracks at about 5 minutes each (an hour listened, once it\'s done)', st.total === 12 && st.runtime === 5 && st.mins === 60, JSON.stringify({ t: st.total, r: st.runtime, m: st.mins }));
  ok('the words fit: Listened, Plan to listen', st.word === 'Listened' && st.want === 'Plan to listen');
  ok('it\'s in Music, not the Hub', st.inMusic && !st.inHub);
  await ev(id => { setMode('music'); }, st.id); await p.waitForTimeout(400);
  if (process.env.SHOTS) await p.screenshot({ path: ENV.OUT + '/music-mode.png' });
  ok('the Music overview has no Characters panel', await ev(() => !/Characters/.test(document.querySelector('#main').innerText) && /Listened/.test(document.querySelector('#main').innerText)));
  await ev(id => { setMode('music'); openItem(id); }, st.id); await p.waitForTimeout(400);
  st = await ev(() => ({ text: document.querySelector('.modal') ? document.querySelector('.modal').innerText : '', chars: !!document.querySelector('[data-tab="chars"], [data-k="chars"]') }));
  ok('its card says Artist, and has no Characters tab', /Artist/.test(st.text) && /Radiohead/.test(st.text) && !/Characters/.test(st.text), st.text.slice(0, 160));
  await ev(() => closeModal());

  // ----- imports and older libraries -----
  ok('a spreadsheet saying "Vinyl LP" or "Album" means music', await ev(() => mediumFromText('Vinyl LP') === 'album' && mediumFromText('Album') === 'album' && mediumFromText('Video game') === 'game'));
  st = await ev(() => { meta.modes = meta.modes.filter(m => m.id !== 'music'); const h = modeById('universal'); h.match = h.match.filter(x => x !== '!album'); meta.settings.music1 = false; migratePaths(); migratePaths(); return { n: meta.modes.filter(m => m.id === 'music').length, hub: modeById('universal').match.filter(x => x === '!album').length }; });
  ok('an older library gets the Music mode once, however often it starts', st.n === 1 && st.hub === 1, JSON.stringify(st));

  ok('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  await b.close(); process.exit(0);
})().catch(e => { console.log('FAIL ' + e.message.split('\n')[0]); process.exit(1); });
