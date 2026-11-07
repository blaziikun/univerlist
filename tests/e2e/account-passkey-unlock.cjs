// Account & sync with passkeys that unlock (WebAuthn PRF): sign in on a new device and the library is just there, no
// passphrase. A "new device" here is the same browser with everything of the site wiped (cookies, storage, the kept key),
// because Chrome's virtual passkey can't be copied to another browser with its secret, while a real synced passkey can.
// Also: the secret never reaches the server, an older passphrase-only account upgrades itself on the next sign-in, and a
// recovery code can be replaced later. Needs the site build (pnpm build); skips without it.
const fs = require('fs'), path = require('path'); const ENV = require('./env.cjs');
const { chromium } = require('playwright');
const { startSyncServer, newDevice, makeAccount } = require('./sync-server.cjs');
if (!fs.existsSync(path.join(ENV.ROOT, 'dist/index.html'))){ console.log('skip  needs the site build (pnpm build)'); process.exit(0); }
const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
const titles = d => d.ev(() => [...items.values()].map(x => x.title));
const has = (d, t) => d.ev(t => [...items.values()].some(x => x.title === t), t);
(async () => {
  const srv = await startSyncServer(8798), BASE = srv.base;
  const b = await chromium.launch(ENV.launch);

  // everything the page sends to the server, to check the passkey's secret is never in it
  const sent = [];
  const watch = d => d.p.on('request', r => { if (r.url().includes('/api/sync')) sent.push(r.postData() || ''); });
  // a new device: the site's storage wiped, then the welcome screen's "Sign in to my account", then the passkey
  async function freshDeviceSignIn(d){
    await d.cdp.send('Storage.clearDataForOrigin', { origin: BASE, storageTypes: 'all' });
    await d.c.clearCookies();
    await d.p.goto(BASE + '/'); await d.p.waitForSelector('[data-act="welcome-signin"]', { timeout: 15000 });
    await d.p.click('[data-act="welcome-signin"]');
    await d.p.waitForSelector('.acct button:has-text("Sign in with a passkey")', { timeout: 15000 });
    await d.p.click('.acct button:has-text("Sign in with a passkey")');
  }

  // ----- a new account: a passkey that can unlock, and a recovery code -----
  const secrets = []; // every secret a passkey gave the page
  const A = await newDevice(b, BASE, { prf: true, secrets }); watch(A);
  await A.ev(() => { addItem({ medium: 'anime', title: 'Frieren', status: 'done', rating: 10 }); addItem({ medium: 'book', title: 'Piranesi', status: 'want' }); });
  const CODE = await makeAccount(A, 'Pat');
  let me = await A.ev(async () => (await fetch('api/sync/me')).json());
  ok('sync starts with nothing to type: the passkey unlocks, and a recovery code is made and shown once', me.has_key === 1 && me.has_pass === 1 && !!me.passkeys[0].box && !!CODE, JSON.stringify({ k: me.has_key, p: me.has_pass }));
  ok('the library went up, sealed', me.version >= 1 && me.size > 28);
  ok('it offers to sign in on another device (with no new passkey)', await A.ev(() => /Sign in on another device/.test(document.querySelector('.acct').innerText) && /No new passkey/.test(document.querySelector('.acct').innerText)));

  // ----- a new device: sign in, and it all loads -----
  await freshDeviceSignIn(A);
  await A.p.waitForFunction(() => [...items.values()].some(x => x.title === 'Piranesi'), null, { timeout: 20000 }).catch(() => {});
  ok('signing in on a new device brings the whole library, with nothing to type', (await has(A, 'Frieren')) && (await has(A, 'Piranesi')), JSON.stringify(await titles(A)));
  ok('…and that device is unlocked from then on', await A.ev(() => !!document.querySelector('.acct button') && /Sync now/.test(document.querySelector('.acct').innerText)));
  // the secret itself, in every way it could be written down, is in none of them
  const forms = secrets.flatMap(b64 => { const u = Buffer.from(b64, 'base64'); return [b64, b64.replace(/=+$/, ''), u.toString('base64url'), u.toString('hex'), [...u].join(',')]; });
  ok('the passkey\'s secret never went to the server', secrets.length >= 2 && sent.length > 4 && !sent.some(s => forms.some(f => s.includes(f))) && !srv.log().includes(secrets[0]), `${secrets.length} secrets, ${sent.length} requests`);

  // ----- a new recovery code, later -----
  await A.p.click('.acct button:has-text("More")');
  await A.p.click('.acct button:has-text("Make a new recovery code")'); await A.p.waitForSelector('.acct .code', { timeout: 15000 });
  const CODE2 = (await A.p.textContent('.acct .code')).trim();
  await A.p.check('.acct input[type="checkbox"]'); await A.p.click('.acct button:has-text("Done")');
  ok('a new recovery code replaces the old one (no passkey prompt needed: this device has the key)', CODE2 !== CODE && /^[0-9A-Z]{4}(-[0-9A-Z]{4}){5}$/.test(CODE2), CODE2);
  ok('…and neither code ever left the browser', ![CODE, CODE2].some(c => srv.log().includes(c.replace(/-/g, '')) || sent.some(s => s.includes(c.replace(/-/g, '')) || s.includes(c))));

  // ----- a passkey that doesn't unlock yet (made before passkey unlock): the recovery code once, then it does -----
  const C = await newDevice(b, BASE, { prf: true }); watch(C);
  await C.p.route('**/api/sync/setup', r => { const j = JSON.parse(r.request().postData()); delete j.passkey; r.continue({ postData: JSON.stringify(j) }); });
  await C.ev(() => addItem({ medium: 'film', title: 'Past Lives', status: 'done' }));
  const CCODE = await makeAccount(C, 'Old');
  await C.p.unroute('**/api/sync/setup');
  me = await C.ev(async () => (await fetch('api/sync/me')).json());
  ok('(an older account: its passkey signs in only)', me.has_pass === 1 && !me.passkeys[0].box);
  await freshDeviceSignIn(C);
  await C.p.waitForSelector('.acct input[aria-label="Recovery code"]', { timeout: 15000 });
  ok('on a new device it asks for the recovery code once', await C.ev(() => /recovery code/.test(document.querySelector('.acct').innerText)));
  await C.p.fill('.acct input[aria-label="Recovery code"]', CCODE); await C.p.click('.acct button:has-text("Unlock")');
  await C.p.waitForFunction(() => [...items.values()].some(x => x.title === 'Past Lives'), null, { timeout: 20000 }).catch(() => {});
  ok('…opens the library', await has(C, 'Past Lives'));
  await C.p.waitForFunction(() => /unlock it by itself from now on/.test(document.querySelector('.acct').innerText), null, { timeout: 15000 }).catch(() => {});
  me = await C.ev(async () => (await fetch('api/sync/me')).json());
  ok('…and gives the passkey a box, so it unlocks by itself from now on', !!me.passkeys[0].box);
  await freshDeviceSignIn(C);
  await C.p.waitForFunction(() => [...items.values()].some(x => x.title === 'Past Lives'), null, { timeout: 20000 }).catch(() => {});
  ok('the next new device: signing in is all it takes', await has(C, 'Past Lives'));

  const errs = [...A.errs, ...C.errs];
  ok('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  await b.close(); srv.stop(); setTimeout(() => process.exit(0), 500);
})().catch(e => { console.log('FAIL ' + e.message.split('\n')[0]); process.exit(1); });
