// An extension's secret settings (here the video-files extension's companion password) are never written into a backup
// in the clear, come back with the backup passphrase, and leave nothing behind when it's removed. An extension reaches
// no web address it doesn't list. And the retired AI assistant: a copy added before is deleted when the app starts, an
// old backup's copy isn't brought back, and the Learning Centre no longer offers to ask it.
const fs = require('fs'); const ENV = require('./env.cjs');
const { chromium } = require('playwright'); const { setup } = require('./mocks.cjs');
const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
const ID = 'local-media-player';
// the retired extension as it was saved on a device that had added it
const oldAI = { manifest: { id: 'ai-assistant', name: 'AI assistant', version: '1.0.0', author: 'UniverList', main: 'main.js', permissions: ['storage', 'net'], hosts: ['api.anthropic.com'] }, files: { 'main.js': '' }, on: true, data: { settings: { key: 'sk-old' } }, at: '2026-11-01T00:00:00Z' };
(async () => { const b = await chromium.launch(ENV.launch), c = await b.newContext(); await setup(c);
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); const ev = (f, a) => p.evaluate(f, a);
  await p.goto(ENV.APP); await p.waitForTimeout(800); await p.fill('#wl-name', 'T'); await p.click('[data-act="welcome-done"]');
  ok('nothing of it runs until it\'s added', await ev(id => !extGet(id) && !EXT.frames.has(id), ID));
  const zip = fs.readFileSync(ENV.EXT(ID)).toString('base64');
  await ev(z => extInstall(new File([Uint8Array.from(atob(z), ch => ch.charCodeAt(0))], 'x.zip', { type: 'application/zip' })), zip); await p.waitForTimeout(1200);
  await ev(id => { const x = extGet(id); x.data = { ...(x.data || {}), settings: { token: 'pw-test-123' } }; return extSave(x); }, ID);
  ok('added, it runs', await ev(id => EXT.frames.has(id), ID));
  ok('it can\'t reach a web address it doesn\'t list', await ev(async id => { try { await extNetFetch(extGet(id), { url: 'https://evil.example/x' }); return false; } catch (e) { return /isn't one of/.test(e.message); } }, ID));
  // ----- its secret in a backup: never in the clear; sealed with a backup passphrase, and back on import -----
  const B = await ev(async id => {
    const plain = await v2Files({}), sealed = await v2Files({ keysPass: 'backup-pass' });
    const has = r => r.files.some(f => typeof f.data === 'string' && f.data.includes('pw-test-123'));
    const keys = (sealed.files.find(f => f.name === 'private/keys.json') || {}).data;
    const x = extGet(id); x.data.settings.token = ''; await extSave(x);
    const box = document.createElement('input'); box.id = 'imp-keypass'; box.value = 'backup-pass'; document.body.append(box);
    await applyParts({ keys: { __locked: JSON.parse(keys) } }, { keys: true }, 'merge');
    box.remove();
    return { plain: has(plain), sealed: has(sealed), sealedFile: !!keys, back: extGet(id).data.settings.token };
  }, ID);
  ok('its password is in no backup in the clear, passphrase or not', !B.plain && !B.sealed, JSON.stringify(B));
  ok('…with a backup passphrase it\'s sealed beside your keys, and comes back on import', B.sealedFile && B.back === 'pw-test-123', JSON.stringify(B));
  // ----- the retired AI assistant -----
  ok('the AI assistant isn\'t offered any more', await ev(() => { goSettings('ext'); return !/AI assistant/.test(document.body.textContent); }));
  await ev(() => { ACS().subjects.push({ id: 's-m', name: 'Mathematics', fields: { Analysis: { lvl: 0 } }, order: ['Analysis'] }); setMode('academic'); ui.learnSub = 's-m'; goTab('learn'); }); await p.waitForTimeout(200);
  ok('…nor asked for suggestions in the Learning Centre', await ev(() => !document.querySelector('[data-act="lc-src-ai"]') && /Look it up/.test(document.body.textContent)));
  await ev(async r => tx('x', 'readwrite', s => { s.put(r, 'ai-assistant'); }, await extDB()), oldAI);
  await p.reload(); await p.waitForTimeout(1500);
  if (await p.$('#wl-name')) { await p.fill('#wl-name', 'T'); await p.click('[data-act="welcome-done"]'); }
  ok('a copy added before is deleted when the app starts, its saved key with it', await ev(async () => !extGet('ai-assistant') && !(await idbAll('x', await extDB())).some(([k]) => k === 'ai-assistant')));
  ok('…the rest stay', await ev(id => !!extGet(id), ID));
  await ev(r => extRestore([r]), oldAI); await p.waitForTimeout(300);
  ok('an old backup\'s copy isn\'t brought back', await ev(async () => !extGet('ai-assistant') && !(await idbAll('x', await extDB())).some(([k]) => k === 'ai-assistant')));
  await ev(r => extRestore([{ ...r, manifest: { ...r.manifest, author: 'someone' } }]), oldAI); await p.waitForTimeout(300);
  ok('someone else\'s extension that shares the name is left alone', await ev(() => !!extGet('ai-assistant')));
  // ----- removing one leaves nothing -----
  await ev(() => { goSettings('ext'); }); await p.waitForTimeout(100);
  await p.click(`[data-act="ext-remove"][data-k="${ID}"]`); await p.waitForTimeout(400);
  ok('removed: nothing left of it', await ev(async id => !extGet(id) && !EXT.frames.has(id) && !document.querySelector(`iframe[title="extension ${id}"]`) && !(await idbAll('x', await extDB())).some(([k]) => k === id), ID));
  ok('no page errors', !errs.length, errs.join(' | '));
  await b.close(); })();
