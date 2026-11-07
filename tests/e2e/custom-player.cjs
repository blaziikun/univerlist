// The player's own controls and making the page yours: controls on the video (play, scrub, time, volume) that also seek converted
// streams; any button on the video, under it or hidden (by ⋯ or by dragging in "Edit on the page"); the look (size, side panel,
// corners, controls size, how soon they hide); and the browser's own controls as an option.
const fs = require('fs'), http = require('http');
const ENV = require('./env.cjs');
const { chromium } = require('playwright'); const { setup } = require('./mocks.cjs');
const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
(async () => {
  const file = fs.readFileSync(ENV.FIX + '/videos/Bungo Stray Dogs/Bungo Stray Dogs S01E01.webm');
  const srv = http.createServer((req, res) => { const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || ''), s = m && m[1] ? +m[1] : 0, e = m && m[2] ? Math.min(+m[2], file.length - 1) : file.length - 1;
    res.writeHead(m ? 206 : 200, { 'content-type': 'video/webm', 'accept-ranges': 'bytes', 'access-control-allow-origin': '*', 'content-length': e - s + 1, ...(m ? { 'content-range': `bytes ${s}-${e}/${file.length}` } : {}) }); res.end(file.subarray(s, e + 1)); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const U = p => `http://127.0.0.1:${srv.address().port}/${p}`;
  const b = await chromium.launch({ ...ENV.launch, args: ['--autoplay-policy=no-user-gesture-required'] }), c = await b.newContext({ viewport: { width: 1400, height: 860 } }); await setup(c);
  const p = await c.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); const ev = (f, a) => p.evaluate(f, a);
  await p.goto(ENV.APP); await p.waitForTimeout(800); await p.fill('#wl-name', 'T'); await p.click('[data-act="welcome-done"]');
  // a page saved before the new buttons existed: they slot in where they belong
  await ev(() => { meta.settings.watchPage = { tools: ['next', 'prev', 'back', 'fwd', 'skip', 'ep', 'gap', 'src', 'subs', 'speed', 'pip', 'full', 'cinema', 'lights', 'settings', 'mark'] }; });
  ok('buttons added since are slotted in, not piled at the end', await ev(() => { const t = WP().tools; return t.indexOf('play') < t.indexOf('back') && t.indexOf('time') === t.indexOf('skip') + 1 && t[0] === 'play' && t[1] === 'next'; }), await ev(() => WP().tools.join()));
  await ev(() => { meta.settings.watchPage = {}; });
  const play = srcs => ev(([a, s]) => { meta.settings.player = { ...PS(), autoNext: false, layout: 'docked' }; ui.page = 'watch'; render();
    W.show = { medium: 'anime', title: 'Pc Show', year: 2020, ext: {} }; W.seasons = [{ n: 1, label: 'Pc Show', eps: [1, 2, 3].map(e => ({ e, title: 'Ep ' + e })) }]; W.si = 0; W.view = 'show';
    W.player = { title: 'Pc Show · Episode 1', show: 'Pc Show', film: false, si: 0, e: 1, srcs: s.map(x => ({ ...x, url: a + (x.q || '') })), k: 0, marked: false }; renderPlayer(); }, [U('a.webm'), srcs]);
  const ready = () => p.waitForFunction(() => { const v = document.querySelector('#cinema video'); return v && v.readyState >= 2 && isFinite(v.duration); }, null, { timeout: 15000 });
  const wake = () => p.mouse.move(400 + Math.random() * 50, 300);
  await play([{ name: 'A', how: 'original' }]); await ready(); await ev(() => document.querySelector('#cinema video').pause());

  // ---- the controls ----
  ok("Univerlist's controls by default, not the browser's", await ev(() => !document.querySelector('#cinema video').controls && !!document.querySelector('#cinema .pc .pc-scrub')));
  ok('play, time and volume on the video; back, forward, skip there too', await ev(() => ['pc-play', 'cin-back', 'cin-fwd', 'cin-skip', 'pc-mute'].every(a => document.querySelector(`#cinema .pc [data-act="${a}"]`)) && !!document.querySelector('#cinema .pc .pc-time')));
  await wake(); await p.click('#cinema .pc-play'); await p.waitForTimeout(400);
  ok('▶ plays', await ev(() => !document.querySelector('#cinema video').paused));
  await p.click('#cinema .pc-play'); ok('…and pauses', await ev(() => document.querySelector('#cinema video').paused));
  const box = await p.locator('#cinema .pc-scrub').boundingBox(); await p.mouse.click(box.x + box.width * .5, box.y + box.height / 2); await p.waitForTimeout(300);
  let t = await ev(() => { const v = document.querySelector('#cinema video'); return [v.currentTime, v.duration]; });
  ok('clicking the bar seeks there', Math.abs(t[0] - t[1] / 2) < .4, JSON.stringify(t));
  ok('the time reads where it is', await ev(() => /^0:0\d \/ 0:0\d$/.test(document.querySelector('#cinema .pc-time').textContent)), await ev(() => document.querySelector('#cinema .pc-time').textContent));
  await ev(() => { const r = document.querySelector('#cinema .pc-volr'); r.value = .3; r.dispatchEvent(new Event('input', { bubbles: true })); });
  ok('the volume slider sets the volume', await ev(() => Math.abs(document.querySelector('#cinema video').volume - .3) < .01));
  await wake(); await p.click('#cinema [data-act="pc-mute"]'); ok('🔊 mutes', await ev(() => document.querySelector('#cinema video').muted));
  await p.click('#cinema [data-act="pc-mute"]'); ok('…and unmutes', await ev(() => !document.querySelector('#cinema video').muted));
  await ev(() => { document.querySelector('#cinema video').currentTime = 1; }); await wake(); await p.click('#cinema .pc [data-act="cin-fwd"]'); await p.waitForTimeout(200);
  ok('+10 on the video jumps ahead', await ev(() => document.querySelector('#cinema video').currentTime > 2));
  // a converted stream: the bar knows its full length and seeking starts it again from there
  await play([{ name: 'Converted', how: 'converted', q: '?x=1' }]); await ev(() => { W.player.dur = 100; }); await p.waitForTimeout(800);
  const cb = await p.locator('#cinema .pc-scrub').boundingBox(); await wake(); await p.mouse.click(cb.x + cb.width * .5, cb.y + cb.height / 2); await p.waitForTimeout(500);
  t = await ev(() => ({ off: W.player.offset, src: document.querySelector('#cinema video').getAttribute('src') }));
  ok('seeking a converted stream starts it from that point', t.off === 50 && /[?&]t=50\b/.test(t.src), JSON.stringify(t));
  ok('…and the time counts from there', await ev(() => /^0:5\d \/ 1:40$/.test(document.querySelector('#cinema .pc-time').textContent)), await ev(() => document.querySelector('#cinema .pc-time').textContent));
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(400);
  ok('→ on a converted stream jumps too', await ev(() => W.player.offset >= 59), await ev(() => W.player.offset));

  // ---- where the buttons live ----
  await play([{ name: 'A', how: 'original' }]); await ready();
  await p.click('#cinema [data-act="wp-opts"]'); await p.click('.wpopts [data-act="wp-spot"][data-k="pip"][data-v="video"]');
  ok('⋯: picture-in-picture moved onto the video', await ev(() => !!document.querySelector('#cinema .pc [data-act="cin-pip"]') && !document.querySelector('#cinema .cin-under [data-act="cin-pip"]')));
  await p.click('.wpopts [data-act="wp-spot"][data-k="skip"][data-v="off"]');
  ok('⋯: skip intro hidden', await ev(() => !document.querySelector('#cinema [data-act="cin-skip"]')));
  await p.click('.wpopts [data-act="wp-edit"]'); await p.waitForTimeout(300);
  ok('"Edit on the page" shows every button as something to drag, and the look sliders', await ev(() => document.querySelector('#cinema').classList.contains('editing') && document.querySelectorAll('#cinema .wt').length >= 18 && document.querySelectorAll('#cinema [data-look]').length === 8));
  ok('…the hidden one waits in Hidden', await ev(() => !!document.querySelector('#cinema .we-hidden .wt[data-tool="skip"]')));
  await p.dragAndDrop('#cinema .cin-under .wt[data-tool="mark"]', '#cinema .pc-row[data-zone="video"]'); await p.waitForTimeout(300);
  ok('dragging "watched" onto the video puts it there', await ev(() => !!document.querySelector('#cinema .pc .wt[data-tool="mark"]') && WP().spot.mark === 'video'), await ev(() => JSON.stringify(WP().spot)));
  await p.dragAndDrop('#cinema .we-hidden .wt[data-tool="skip"]', '#cinema .cin-under'); await p.waitForTimeout(300);
  ok('dragging skip intro out of Hidden, under the player', await ev(() => !!document.querySelector('#cinema .cin-under .wt[data-tool="skip"]') && !WP().off.includes('skip')));
  await p.dragAndDrop('#cinema .pc .wt[data-tool="full"]', '#cinema .pc .wt[data-tool="play"]'); await p.waitForTimeout(300);
  ok('…and reordering on the video (full screen now before play)', await ev(() => { const L = [...document.querySelectorAll('#cinema .pc-row[data-zone="video"] .wt')].map(x => x.dataset.tool); return L.indexOf('full') < L.indexOf('play'); }));
  const look = async (k, v) => { await ev(([k, v]) => { const r = document.querySelector(`#cinema [data-look="${k}"]`); r.value = v; r.dispatchEvent(new Event('input', { bubbles: true })); }, [k, v]); await p.waitForTimeout(150); };
  await look('side', 420); ok('side panel width', await ev(() => Math.round(document.querySelector('#cinema .cin-side').getBoundingClientRect().width) === 420), await ev(() => document.querySelector('#cinema .cin-side').getBoundingClientRect().width));
  await look('radius', 0); ok('square corners', await ev(() => getComputedStyle(document.querySelector('#cinema .cin-main')).borderTopLeftRadius === '0px'));
  await look('ctl', 130); ok('bigger controls', await ev(() => getComputedStyle(document.querySelector('#cinema .pc')).fontSize === '18.2px'), await ev(() => getComputedStyle(document.querySelector('#cinema .pc')).fontSize));
  const w0 = await ev(() => document.querySelector('#cinema .cin-main').getBoundingClientRect().width); await look('size', 70);
  ok('a smaller player', await ev(w => document.querySelector('#cinema .cin-main').getBoundingClientRect().width < w * .8, w0));
  await look('hideAfter', 1);
  await p.click('#cinema .we-bar [data-act="wp-edit"]'); await p.waitForTimeout(200);
  ok('Done leaves the edit mode, keeping it all', await ev(() => !document.querySelector('#cinema').classList.contains('editing') && WP().look.side === 420 && WP().look.size === 70));
  await ev(() => document.querySelector('#cinema video').play()); await wake(); await p.waitForTimeout(1600);
  ok('controls hide after the time you chose (1 s)', await ev(() => document.querySelector('#cinema').classList.contains('idle')));
  // cinema mode: everything on the video
  await ev(() => { meta.settings.player = { ...PS(), layout: 'cinema' }; renderPlayer(); }); await ready();
  ok('cinema mode: the buttons from under the player join the controls on the video', await ev(() => !!document.querySelector('#cinema .pc-row.under [data-act="cin-next"]') && !!document.querySelector('#cinema .pc .pc-scrub')));
  // the browser's own controls, if you'd rather
  await ev(() => { meta.settings.player = { ...PS(), controls: 'browser', layout: 'docked' }; renderPlayer(); }); await ready();
  ok("the browser's own controls are one setting away", await ev(() => document.querySelector('#cinema video').controls && !document.querySelector('#cinema .pc')));
  ok('no page errors', !errs.length, errs.slice(0, 3).join(' / '));
  await b.close(); srv.close(); process.exit(0);
})();
