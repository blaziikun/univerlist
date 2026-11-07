// The everyday journey: make a list on a computer, sign your phone in by scanning a QR code (no new passkey: one per
// account), and both keep in step: additions, edits and deletions, either way. The computer's passkey can't unlock by itself and can't be used on the phone (like
// Windows Hello with an iPhone), which is exactly what the QR code is for. Needs the site build (pnpm build).
const fs = require('fs'), path = require('path'); const ENV = require('./env.cjs');
const { chromium } = require('playwright');
const { startSyncServer, newDevice, makeAccount } = require('./sync-server.cjs');
if (!fs.existsSync(path.join(ENV.ROOT, 'dist/index.html'))){ console.log('skip  needs the site build (pnpm build)'); process.exit(0); }
const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
const has = (d, t) => d.ev(t => [...items.values()].some(x => x.title === t), t);
(async () => {
  const srv = await startSyncServer(8797), BASE = srv.base;
  const b = await chromium.launch(ENV.launch);
  let st;
  const sent = [], watch = d => d.p.on('request', r => { if (r.url().includes('/api/sync')) sent.push(r.url() + ' ' + (r.postData() || '')); });

  // ----- on the computer: a list, an account -----
  const PC = await newDevice(b, BASE); watch(PC);
  await PC.c.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await PC.ev(() => { addItem({ medium: 'book', title: 'Dune', status: 'want' }); addItem({ medium: 'film', title: 'Paterson', status: 'done' }); addItem({ medium: 'anime', title: 'Mushishi', status: 'active' }); });
  const CODE = await makeAccount(PC, 'Sam');

  // ----- "Sign in on another device": a QR code -----
  await PC.p.click('.acct button:has-text("Sign in on another device")');
  await PC.p.waitForSelector('.acct .qr svg', { timeout: 15000 });
  ok('"Sign in on another device" shows a QR code to scan', await PC.ev(() => document.querySelectorAll('.acct .qr svg rect, .acct .qr svg path').length > 0));
  if (process.env.SHOTS) await PC.p.screenshot({ path: ENV.OUT + '/acct-qr.png' });
  await PC.p.click('.acct button:has-text("copy the link")');
  const url = await PC.ev(() => navigator.clipboard.readText());
  ok('…holding a link to this site, with the key\'s secret after the # (never sent to a server)', url.startsWith(BASE + '/#link=') && /#link=[\w-]{20,}\.[\w-]{40,}$/.test(url), url.slice(0, 60));
  const secret = url.split('.').pop();

  // ----- on the phone: scan, one tap, Face ID -----
  const PH = await newDevice(b, BASE, { prf: true, url }); watch(PH);
  await PH.p.waitForSelector('.acct button:has-text("Sign in here")', { timeout: 15000 });
  if (process.env.SHOTS){ await PH.p.setViewportSize({ width: 390, height: 844 }); await PH.p.waitForTimeout(300); await PH.p.screenshot({ path: ENV.OUT + '/acct-join.png' }); }
  ok('the phone opens straight to "Sign in here" (no welcome screen, nothing to type)', !(await PH.p.$('#wl-name')) && !(await PH.ev(() => location.hash)));
  await PH.p.click('.acct button:has-text("Sign in here")');
  await PH.p.waitForFunction(() => [...items.values()].some(x => x.title === 'Mushishi'), null, { timeout: 20000 }).catch(() => {});
  ok('one tap, and the phone has the whole list', (await has(PH, 'Dune')) && (await has(PH, 'Paterson')) && (await has(PH, 'Mushishi')));
  await PC.p.waitForFunction(() => /Your other device is signed in/.test(document.querySelector('.acct').innerText), null, { timeout: 10000 }).catch(() => {});
  ok('the computer says the phone is signed in', await PC.ev(() => /Your other device is signed in/.test(document.querySelector('.acct').innerText) && !document.querySelector('.acct .qr')));
  let me = await PH.ev(async () => (await fetch('api/sync/me')).json());
  const phoneKeys = await PH.cdp.send('WebAuthn.getCredentials', { authenticatorId: PH.authenticatorId });
  ok('no new passkey: the account still has its one, and the phone made none', me.passkeys.length === 1 && !phoneKeys.credentials.length && me.sessions.length === 2, JSON.stringify({ n: me.passkeys.length, phone: phoneKeys.credentials.length }));
  ok('the code\'s secret never reached the server', !sent.some(s => s.includes(secret)) && !srv.log().includes(secret));
  const reuse = await PH.ev(async u => { const t = u.split('#link=')[1].split('.')[0]; return (await fetch('api/sync/link/join', { method: 'POST', headers: { 'X-UL-Sync': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t }) })).status; }, url);
  ok('the code works once: scanning it again does nothing', reuse === 404);

  // ----- both ways, deletions too -----
  await PH.ev(async () => { addItem({ medium: 'book', title: 'Piranesi', status: 'want' }); await window.ulSync.now(); });
  await PC.ev(async () => { await window.ulSync.now(); });
  ok('added on the phone, it\'s on the computer', await has(PC, 'Piranesi'));
  // delete Dune on the computer and sync; meanwhile the phone changes something too, so the two have to be merged
  await PC.ev(async () => { const id = [...items.entries()].find(([, x]) => x.title === 'Dune')[0]; change('Delete 1', [id], () => null); await window.ulSync.now(); });
  await PH.ev(async () => { addItem({ medium: 'film', title: 'Past Lives', status: 'want' }); await window.ulSync.now(); });
  ok('deleted on the computer, it\'s gone from the phone too, even with changes on both', !(await has(PH, 'Dune')) && (await has(PH, 'Past Lives')));
  await PC.ev(async () => { await window.ulSync.now(); });
  ok('…and it doesn\'t come back to the computer, which gets the phone\'s new one', !(await has(PC, 'Dune')) && (await has(PC, 'Past Lives')));
  // and the other way round: deleted on the phone while the computer also changed
  await PH.ev(async () => { const id = [...items.entries()].find(([, x]) => x.title === 'Paterson')[0]; change('Delete 1', [id], () => null); await window.ulSync.now(); });
  await PC.ev(async () => { addItem({ medium: 'book', title: 'Stoner', status: 'want' }); await window.ulSync.now(); });
  ok('deleted on the phone, it\'s gone from the computer too', !(await has(PC, 'Paterson')) && (await has(PC, 'Stoner')));

  // ----- something added while a sync is still downloading isn't lost -----
  await PC.ev(async () => { addItem({ medium: 'book', title: 'Jane Eyre', status: 'want' }); await window.ulSync.now(); }); // so the phone has something to download
  await PH.p.route('**/api/sync/data', async r => { if (r.request().method() === 'GET') await new Promise(w => setTimeout(w, 1500)); r.continue(); });
  await PH.ev(async () => { const s = window.ulSync.now(); await new Promise(w => setTimeout(w, 500)); addItem({ medium: 'film', title: 'Aftersun', status: 'want' }); await s; await window.ulSync.now(); });
  await PH.p.unroute('**/api/sync/data');
  await PC.ev(async () => { await window.ulSync.now(); });
  ok('added while a sync was downloading: kept, and it reaches the other device', (await has(PH, 'Aftersun')) && (await has(PH, 'Jane Eyre')) && (await has(PC, 'Aftersun')));

  // ----- you pick the phone up again: the app opens, catches up, and sends a change by itself, no "Sync now" -----
  // (opened fresh, so nothing from the steps above, done in quick succession, is still waiting to be sent)
  await PH.p.reload(); await PH.p.waitForFunction(() => window.ulBooted, null, { timeout: 20000 });
  await PH.p.waitForTimeout(4000); // its start-up sync, 3 s after opening…
  await PH.ev(() => window.ulSync.now()); // …finished (on a busy machine it can still be going)
  // The last step's sync brought Jane Eyre and Stoner in moments before this reload. They must have been saved here before
  // the sync wrote down that this device has them: if not, they'd be missing now, and the start-up sync would have taken
  // them for deleted here and deleted them everywhere.
  await PC.ev(() => window.ulSync.now());
  ok('reopened right after a sync brought things in: they were saved here, and nothing was deleted anywhere', (await has(PH, 'Jane Eyre')) && (await has(PH, 'Stoner')) && (await has(PC, 'Jane Eyre')) && (await has(PC, 'Stoner')));
  await PH.ev(() => addItem({ medium: 'book', title: 'Middlemarch', status: 'want' }));
  // Watch for it on the computer, not for the server's version going up: the computer uploads by itself too (it fills
  // in details for what it was just sent, like any device), and on a slow machine that can land first.
  const t0 = Date.now();
  for (let i = 0; i < 40; i++) {
    await PC.ev(async () => { await window.ulSync.now(); });
    if (await has(PC, 'Middlemarch')) break;
    await PH.p.waitForTimeout(2000);
  }
  const took = Math.round((Date.now() - t0) / 1000);
  ok('a change goes up by itself within moments (no "Sync now" on the phone)', await has(PC, 'Middlemarch'), took + ' s');

  // ----- the phone got in by a QR code: it can't delete the account or change who can get in without the passkey -----
  st = await PH.ev(async () => {
    const post = (u, j, m = 'POST') => fetch('api/sync/' + u, { method: m, headers: { 'X-UL-Sync': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(j) }).then(r => r.status);
    return { del: await post('delete', { confirm: 'DELETE' }), remove: await post('passkey/remove', { id: 'x' }), add: await post('passkey/options', {}) };
  });
  ok('a device signed in by a QR code can\'t delete the account or change its passkeys without confirming it\'s you', st.del === 403 && st.remove === 403 && st.add === 403, JSON.stringify(st));
  ok('…so the account is still there', (await PC.ev(async () => (await fetch('api/sync/me')).status)) === 200);

  // ----- an account with extra passkeys (from before it was one each): keep one, the rest go -----
  await PH.ev(async code => { // a second passkey, made the old way, straight through the API
    const post = (u, j) => fetch('api/sync/' + u, { method: 'POST', headers: { 'X-UL-Sync': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(j) }).then(r => r.json());
    // adding a passkey needs "confirm it's you": the phone (in by a QR code) confirms with the recovery code, made into
    // its sign-in key the way recovery-code.ts signInKey does
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode('UniverList recovery sign-in v1'), iterations: 100000 }, base, 256);
    await post('confirm', { code: btoa(String.fromCharCode(...new Uint8Array(bits))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') });
    const bin = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
    const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const { id, options: o } = await post('passkey/options', {});
    const c = await navigator.credentials.create({ publicKey: { ...o, challenge: bin(o.challenge), user: { ...o.user, id: bin(o.user.id) }, excludeCredentials: (o.excludeCredentials || []).map(x => ({ ...x, id: bin(x.id) })) } });
    await post('passkey/verify', { id, response: { id: c.id, rawId: b64u(c.rawId), type: c.type, clientExtensionResults: {}, response: { clientDataJSON: b64u(c.response.clientDataJSON), attestationObject: b64u(c.response.attestationObject), transports: c.response.getTransports() } } });
  }, CODE);
  await PC.ev(() => goSettings('account')); await PC.p.waitForSelector('.acct button:has-text("Keep only this one")', { timeout: 15000 });
  ok('with two passkeys, it says you only need one', await PC.ev(() => /You only need one/.test(document.querySelector('.acct').innerText)));
  const keep = (await PC.ev(async () => (await fetch('api/sync/me')).json())).passkeys[0].id;
  await PC.p.locator('.acct button:has-text("Keep only this one")').first().click(); await PC.p.waitForTimeout(1500);
  me = await PC.ev(async () => (await fetch('api/sync/me')).json());
  ok('"Keep only this one" leaves exactly that one', me.passkeys.length === 1 && me.passkeys[0].id === keep, JSON.stringify(me.passkeys.map(p => p.id)));

  // ----- signing out of a borrowed device: nothing of yours left behind -----
  const sessionsBefore = (await PC.ev(async () => (await fetch('api/sync/me')).json())).sessions.length;
  await PH.ev(() => goSettings('account')); await PH.p.waitForSelector('.acct button:has-text("More")'); await PH.p.click('.acct button:has-text("More")');
  await PH.p.click('.acct button:has-text("remove my library from this browser")');
  await PH.p.waitForTimeout(3000); await PH.p.waitForFunction(() => window.ulBooted, null, { timeout: 20000 }).catch(() => {});
  st = await PH.ev(async () => ({
    items: items.size,
    dbs: (await indexedDB.databases()).map(d => d.name),
    key: await new Promise(ok => { const r = indexedDB.open('ul-account'); r.onupgradeneeded = () => {}; r.onsuccess = () => { const d = r.result; if (!d.objectStoreNames.contains('k')) return ok(null); const g = d.transaction('k').objectStore('k').get('data'); g.onsuccess = () => ok(g.result || null); g.onerror = () => ok(null); }; r.onerror = () => ok(null); }),
    sync: localStorage.getItem('ul-sync'), base: localStorage.getItem('ul-sync-base'), me: (await fetch('api/sync/me')).status,
  }));
  const cookieLeft = (await PH.c.cookies(BASE)).some(c => c.name === '__Host-ul_s');
  ok('"Sign out and remove my library" leaves nothing: no library, no key, no sync state, no session', st.items === 0 && !st.key && !st.sync && !st.base && st.me === 401 && !cookieLeft, JSON.stringify({ ...st, cookieLeft }));
  const sessionsAfter = (await PC.ev(async () => (await fetch('api/sync/me')).json())).sessions.length;
  ok('…the server ended that session, and the computer keeps everything', sessionsAfter === sessionsBefore - 1 && (await has(PC, 'Middlemarch')), sessionsBefore + ' → ' + sessionsAfter);

  const errs = [...PC.errs, ...PH.errs];
  ok('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  await b.close(); srv.stop(); setTimeout(() => process.exit(0), 500);
})().catch(e => { console.log('FAIL ' + e.message.split('\n')[0]); process.exit(1); });
