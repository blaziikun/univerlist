// Renamed extensions keep everything: an installed local-media becomes local-media-player with its settings and a
// series' own servers, an old backup brings it in under the new name, and importing can take only an extension's
// settings (keeping your version).
// Also: the export is named profile-export_<name>_<date>.zip.
const ENV = require('./env.cjs');
const { chromium } = require('playwright'); const { setup } = require('./mocks.cjs');
const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
const extFile = (v, id = 'local-media') => JSON.stringify({ id, name: 'Your own video files', version: v, permissions: ['storage'], settings: [{ key: 'folders', label: 'Folders', type: 'textarea', default: '' }], code: `/* v${v} */ univerlist.storage.get('x');` });
(async () => {
  const b = await chromium.launch(ENV.launch), c = await b.newContext({ acceptDownloads: true }); await setup(c);
  const p = await c.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); const ev = (f, a) => p.evaluate(f, a);
  await p.goto(ENV.APP); await p.waitForTimeout(800); await p.fill('#wl-name', 'Robin Vale'); await p.click('[data-act="welcome-done"]');
  // an install from before the rename, with settings and a series' own servers
  await ev(t => extInstall(new File([t], 'old.json')), extFile('1.3.0'));
  ok('(a fresh install of an old local-media zip already comes in as local-media-player)', await ev(() => !!extGet('local-media-player') && !extGet('local-media')));
  // put one under the old id straight into storage, the way it was saved before
  await ev(async () => { const x = extGet('local-media-player'); const old = { ...x, manifest: { ...x.manifest, id: 'local-media' }, data: { settings: { folders: '/Movies (old)' }, series: { 'anime:bleach': [{ value: 'http://192.168.1.20/bleach/' }] } } };
    await tx('x', 'readwrite', s => { s.delete('local-media-player'); s.put(old, 'local-media'); }, await extDB()); });
  await p.reload(); await p.waitForTimeout(1500);
  if (await p.$('#wl-name')){ await p.fill('#wl-name', 'Robin Vale'); await p.click('[data-act="welcome-done"]'); }   // the library itself wasn't saved yet; only the extension store matters here
  let st = await ev(async () => { const keys = (await idbAll('x', await extDB())).map(([k]) => k); const x = extGet('local-media-player'); return { keys, folders: x && x.data.settings.folders, series: x && Object.keys(x.data.series || {}), old: !!extGet('local-media') }; });
  ok('an installed local-media is now local-media-player, with its folders and servers', st.keys.join() === 'local-media-player' && st.folders === '/Movies (old)' && st.series.join() === 'anime:bleach' && !st.old, JSON.stringify(st));
  // a backup with it in it (taken now, so its settings are the old ones)
  await ev(() => goSettings('io')); await p.waitForTimeout(300);
  const dlP = p.waitForEvent('download', { timeout: 60000 }); await p.click('[data-act="export-open"]'); await p.click('.modal [data-act="export-zip"]'); await p.waitForTimeout(400);
  if (await p.$('[data-act="export-nokeys"]')) await p.click('[data-act="export-nokeys"]');
  const dl = await dlP;
  ok('the export is named profile-export_<name>_<date>.zip', /^profile-export_Robin-Vale_\d{4}-\d\d-\d\d\.zip$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  const zip = ENV.OUT + '/rename.zip'; await dl.saveAs(zip);
  // the new version is installed, and its settings changed since
  await ev(t => extInstall(new File([t], 'new.json')), extFile('1.5.0', 'local-media-player'));
  await ev(async () => { const x = extGet('local-media-player'); x.data = { ...x.data, settings: { folders: '/Movies (new)', note: 'keepme' } }; await extSave(x); });
  ok('installing the new version keeps the settings', await ev(() => extGet('local-media-player').manifest.version === '1.5.0' && /new/.test(extGet('local-media-player').data.settings.folders)));
  // import the backup, only its settings
  await p.setInputFiles('#file-import', zip); await p.waitForSelector('[data-act="import-merge"]');
  ok('the import asks: the extension, or only its settings', await ev(() => document.querySelectorAll('[data-exthow]').length === 2));
  await p.check('[data-exthow="settings"]'); await p.click('[data-act="import-merge"]'); await p.waitForFunction(() => !ui.modal, null, { timeout: 30000 }); await p.waitForTimeout(300);
  st = await ev(() => { const x = extGet('local-media-player'); return { v: x.manifest.version, code: /v1\.5\.0/.test(x.files['main.js']), folders: x.data.settings.folders, note: x.data.settings.note, series: Object.keys(x.data.series || {}) }; });
  ok('"only its settings": your version stays, the backup\'s settings and servers come in', st.v === '1.5.0' && st.code && /old/.test(st.folders) && st.series.join() === 'anime:bleach', JSON.stringify(st));
  ok("…and settings the backup didn't have are kept", st.note === 'keepme', JSON.stringify(st));
  // and the whole extension
  await p.setInputFiles('#file-import', zip); await p.waitForSelector('[data-act="import-merge"]'); await p.click('[data-act="import-merge"]'); await p.waitForFunction(() => !ui.modal, null, { timeout: 30000 }); await p.waitForTimeout(300);
  st = await ev(() => ({ ids: EXT.list.map(x => x.manifest.id), v: extGet('local-media-player').manifest.version }));
  ok('"the extension and its settings": the backup\'s version comes in, under the new name', st.ids.join() === 'local-media-player' && st.v === '1.3.0', JSON.stringify(st));
  ok('no page errors', !errs.length, errs.slice(0, 3).join(' / '));
  await b.close(); process.exit(0);
})();
