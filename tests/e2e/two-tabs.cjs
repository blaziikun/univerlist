// The app open in two tabs: the older tab never writes its copy of your settings over what the newer one saved, offers
// to bring the changes in, and still saves single items.
const ENV = require('./env.cjs');
const { chromium } = require('playwright'); const { setup } = require('./mocks.cjs');
const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
(async () => {
  const b = await chromium.launch(ENV.launch), c = await b.newContext(); await setup(c);
  const errs = [], open = async () => { const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(ENV.APP); await p.waitForTimeout(900); return p; };
  const A = await open(); await A.fill('#wl-name', 'T'); await A.click('[data-act="welcome-done"]'); await A.waitForTimeout(300);
  await A.evaluate(() => flushSave());
  const B = await open();

  // B renames you and saves; A, still open, then changes something of its own
  await B.evaluate(async () => { meta.profile.name = 'From B'; markDirty(); await flushSave(); });
  await A.waitForTimeout(300);
  ok('the older tab offers to bring the changes in', await A.evaluate(() => /another tab/.test(document.body.innerText)));
  const id = await A.evaluate(async () => { meta.profile.bio = 'From A'; const id = addItem({ medium: 'book', title: 'Added in A', status: 'want' }); await flushSave(); return id; });

  const C = await open();
  const st = await C.evaluate(id => ({ name: meta.profile.name, bio: meta.profile.bio || '', item: items.has(id) }), id);
  ok('…and doesn\'t write its older settings over the newer ones', st.name === 'From B', JSON.stringify(st));
  ok('…while what it added is still kept', st.item, JSON.stringify(st));

  ok('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
})().catch(e => { console.log('FAIL ' + e.message.split('\n')[0]); process.exit(1); });
