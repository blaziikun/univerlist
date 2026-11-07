// Download everything opens a dialog: every part listed and ticked, so a full backup is one click, and anything can be
// left out. What's unticked really stays out of the zip; with everything in, it counts as the last full backup.
const fs = require('fs'); const ENV = require('./env.cjs');
const { chromium } = require('playwright'); const { setup } = require('./mocks.cjs');
const { unzipSync } = require('fflate');
const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
const names = file => Object.keys(unzipSync(new Uint8Array(fs.readFileSync(file))));
(async () => {
  const b = await chromium.launch(ENV.launch), c = await b.newContext({ acceptDownloads: true }); await setup(c);
  const p = await c.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); const ev = (f, a) => p.evaluate(f, a);
  await p.goto(ENV.APP); await p.waitForTimeout(800); await p.fill('#wl-name', 'T'); await p.click('[data-act="welcome-done"]');
  await ev(() => { addItem({ medium: 'anime', title: 'Frieren', status: 'done' }); addItem({ medium: 'book', title: 'Dune', status: 'active' }); goSettings('io'); });
  await p.waitForTimeout(300);

  await p.click('[data-act="export-open"]'); await p.waitForSelector('.modal [data-act="export-zip"]');
  let st = await ev(() => { const boxes = [...document.querySelectorAll('.modal [data-expp]')]; return { parts: boxes.map(x => x.dataset.expp), all: boxes.every(x => x.checked), focus: document.activeElement && document.activeElement.dataset.act }; });
  ok('Download everything opens a dialog listing every part, all ticked', st.all && ['library', 'favourites', 'lists', 'profile', 'preferences', 'themes', 'images'].every(k => st.parts.includes(k)), st.parts.join(' '));
  ok('…with Download ready to press', st.focus === 'export-zip');

  // everything: one click
  let [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('.modal [data-act="export-zip"]')]);
  const full = ENV.OUT + '/dialog-full.zip'; await dl.saveAs(full);
  let N = names(full);
  ok('a full backup has every part', ['library/anime.json', 'library/book.json', 'collections/lists.json', 'personal/preferences.json', 'images/index.json'].every(n => N.includes(n)), N.filter(n => !n.startsWith('images/')).join(' '));
  ok('…the dialog closes, and it counts as your last full backup', await ev(() => !ui.modal && !!meta.settings.lastBackup));

  // leave the library and the pictures out
  await ev(() => { meta.settings.lastBackup = null; });
  await p.click('[data-act="export-open"]'); await p.waitForSelector('.modal [data-expp="library"]');
  await p.uncheck('.modal [data-expp="library"]'); await p.uncheck('.modal [data-expp="images"]');
  [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('.modal [data-act="export-zip"]')]);
  const part = ENV.OUT + '/dialog-part.zip'; await dl.saveAs(part);
  N = names(part);
  ok('what you untick stays out', !N.some(n => n.startsWith('library/')) && !N.includes('images/index.json') && N.includes('collections/lists.json'), N.join(' '));
  ok('…and a backup with parts left out isn\'t counted as a full one', await ev(() => !meta.settings.lastBackup));
  await p.click('[data-act="export-open"]'); await p.waitForSelector('.modal [data-expp="library"]');
  ok('what you left out stays unticked next time', !(await p.isChecked('.modal [data-expp="library"]')));
  await p.keyboard.press('Escape');

  ok('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
})().catch(e => { console.log('FAIL ' + e.message.split('\n')[0]); process.exit(1); });
