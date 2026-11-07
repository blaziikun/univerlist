// Export and import with a backup passphrase: the box keeps what you typed, leaving keys out is asked about first,
// and an import shows that it's working. Needs no export of yours.
const fs = require('fs');
const ENV = require('./env.cjs');
const { chromium } = require('playwright'); const { setup } = require('./mocks.cjs');
const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
(async () => {
  const b = await chromium.launch(ENV.launch), mk = async () => { const c = await b.newContext({ acceptDownloads: true, viewport: { width: 1300, height: 900 } }); await setup(c); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto(ENV.APP); await p.waitForTimeout(800); await p.fill('#wl-name', 'T'); await p.click('[data-act="welcome-done"]'); return p; };
  const p = await mk(), ev = (f, a) => p.evaluate(f, a);
  await ev(() => { for (let i = 0; i < 5; i++) addItem({ medium: 'anime', title: 'Show ' + i, status: 'done', total: 3, prog: 3 }); KEYS.tmdb = 'TMDBSECRET'; saveKeys(); goSettings('io'); });
  await p.waitForTimeout(300);

  // no passphrase, but there are keys: it asks first
  await p.click('[data-act="export-open"]'); await p.waitForSelector('.modal [data-act="export-zip"]'); await p.click('[data-act="export-zip"]'); await p.waitForTimeout(300);
  ok('no passphrase: it asks before leaving the keys out', await ev(() => !!document.querySelector('#exp-ask') && /won't be in this backup/.test(document.querySelector('#exp-ask').textContent)));
  await p.click('[data-act="export-addpass"]');
  ok('"Add a passphrase" goes to the box', await ev(() => document.activeElement && document.activeElement.id === 'exp-keypass'));
  await p.fill('#exp-keypass', 'hunter22-x');

  // the passphrase stays when the page redraws (it used to be emptied)
  await ev(() => { renderMain(); renderOverlay(); }); await p.waitForTimeout(100);
  ok('the passphrase is still there after the page redraws', (await p.inputValue('#exp-keypass')) === 'hunter22-x');
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('[data-act="export-zip"]')]); await dl.saveAs(ENV.OUT + '/pass.zip');
  await p.waitForFunction(() => ui.expRun && ui.expRun.note, null, { timeout: 30000 }); await p.waitForTimeout(400);
  ok('the dialog closes once it has downloaded', await ev(() => !ui.modal));
  await p.click('[data-act="export-open"]'); await p.waitForSelector('.modal [data-act="export-zip"]'); 
  ok('…and the passphrase is still there next time', (await p.inputValue('#exp-keypass')) === 'hunter22-x');
  ok('no question when a passphrase is given', await ev(() => !document.querySelector('#exp-ask')));

  // without one: ask, then "Download without them" goes ahead
  await p.fill('#exp-keypass', ''); await p.click('[data-act="export-zip"]'); await p.waitForTimeout(300);
  const [dl2] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('[data-act="export-nokeys"]')]); await dl2.saveAs(ENV.OUT + '/nopass.zip');
  ok('"Download without them" downloads, with no keys inside', fs.statSync(ENV.OUT + '/nopass.zip').size > 0 && !fs.readFileSync(ENV.OUT + '/nopass.zip').includes('TMDBSECRET') && !fs.readFileSync(ENV.OUT + '/nopass.zip').toString('latin1').includes('private/keys.json'));
  ok('with the zip made with a passphrase, keys are inside but sealed', fs.readFileSync(ENV.OUT + '/pass.zip').toString('latin1').includes('private/keys.json') && !fs.readFileSync(ENV.OUT + '/pass.zip').includes('TMDBSECRET'));

  // import: the box keeps the passphrase, the dialog shows it's working, the keys come back
  const q = await mk();
  await q.setInputFiles('#file-import', ENV.OUT + '/pass.zip'); await q.waitForSelector('[data-act="import-replace"]');
  await q.fill('#imp-keypass', 'hunter22-x'); await q.evaluate(() => renderOverlay());
  ok('the import passphrase survives the dialog redrawing', (await q.inputValue('#imp-keypass')) === 'hunter22-x');
  await q.evaluate(() => { window.__seen = []; new MutationObserver(() => { const m = document.querySelector('#overlay .busybar'); if (m && !window.__seen.length) window.__seen.push(document.querySelector('#overlay [data-act="import-replace"]').textContent + '|' + document.querySelector('#overlay [data-act="import-replace"]').disabled); }).observe(document.getElementById('overlay'), { childList: true, subtree: true }); });
  await q.click('[data-act="import-replace"]'); await q.waitForFunction(() => !ui.modal, null, { timeout: 30000 }); await q.waitForTimeout(300);
  const seen = await q.evaluate(() => window.__seen[0] || '');
  ok('while it imports, the dialog shows a loader and the buttons are off', /Replacing/.test(seen) && /true$/.test(seen), seen);
  ok('the keys came back', (await q.evaluate(() => KEYS.tmdb)) === 'TMDBSECRET');
  ok('and the library', (await q.evaluate(() => items.size)) >= 5);
  ok('no page errors', !p.errs.length && !q.errs.length, [...p.errs, ...q.errs].slice(0, 3).join(' / '));
  await b.close(); process.exit(0);
})();
