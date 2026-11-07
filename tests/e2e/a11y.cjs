// Accessibility: axe-core checks every page and the main dialogs against WCAG 2.1 A and AA, and closing a dialog
// puts focus back on the button that opened it. The privacy page says this runs on every change, so it must.
const ENV = require('./env.cjs'); const path = require('path');
const { chromium } = require('playwright'); const { setup } = require('./mocks.cjs');
const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
const AXE = require.resolve('axe-core/axe.min.js');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
(async () => {
  // axe is added as a script, which the app's own CSP would rightly block
  const b = await chromium.launch(ENV.launch), c = await b.newContext({ bypassCSP: true }); await setup(c);
  const p = await c.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); const ev = (f, a) => p.evaluate(f, a);
  const sweep = async (name, within) => {
    if (!(await ev(() => !!window.axe))) await p.addScriptTag({ path: AXE });
    const v = await ev(async ([tags, within]) => {
      const r = await axe.run(within ? document.querySelector(within) || document : document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] });
      return r.violations.map(x => `${x.id} ×${x.nodes.length} (${x.nodes[0].target.join(' ')})`);
    }, [TAGS, within]);
    ok(`${name}: no accessibility problems`, !v.length, v.join(' · '));
  };

  await p.goto(ENV.APP); await p.waitForTimeout(800);
  await sweep('the welcome screen');
  await p.fill('#wl-name', 'T'); await p.click('[data-act="welcome-done"]'); await p.waitForTimeout(300);
  await ev(() => {
    addItem({ medium: 'anime', title: 'Frieren', status: 'done', rating: 9 });
    addItem({ medium: 'book', title: 'Dune', status: 'active' });
    addItem({ medium: 'film', title: 'Perfect Days', status: 'want' });
  });

  for (const tab of ['overview', 'library', 'favourites', 'stats', 'lists', 'discover', 'rank']) {
    await ev(t => { closeModal && ui.modal && closeModal(); goTab(t); }, tab); await p.waitForTimeout(250);
    await sweep(`the ${tab} tab`);
  }
  for (const page of ['watch', 'read']) {
    await ev(pg => { ui.page = pg; render(); }, page); await p.waitForTimeout(300);
    await sweep(`the ${page} page`);
  }
  await ev(() => { meta.settings.builtins = { ...(meta.settings.builtins || {}), backdrops: true }; });
  const secs = await ev(() => setSecs().map(([k]) => k));
  for (const s of secs) {
    await ev(s => goSettings(s), s); await p.waitForTimeout(300);
    await sweep(`Settings › ${s}`);
  }
  await ev(() => { closeSettings(); ui.page = 'profile'; render(); });

  // every mode has its own theme, so contrast is checked in each of them
  const modes = await ev(() => meta.modes.map(m => m.id));
  for (const mode of modes) {
    await ev(m => { setMode(m); goTab('library'); }, mode); await p.waitForTimeout(300);
    // a new mode fades its theme in: wait for that to finish, or colours are measured halfway (slow machines)
    await p.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running' || a.effect.getTiming().iterations === Infinity), null, { timeout: 5000 }).catch(() => {});
    await sweep(`the library in the ${mode} mode`);
  }
  await ev(m => setMode(m), modes[0]);

  // dialogs
  const id = await ev(() => [...items.keys()][0]);
  const dialogs = [['The item card', () => `openItem(${JSON.stringify(id)})`], ['Add', () => 'openAdd()'], ['Discover', () => 'openDiscover()'],
    ['Download everything', () => 'openModal("exportpick")'], ['Bring things in', () => 'openModal("io")'], ['Paste a list', () => 'openModal("paste")'],
    ['Keyboard shortcuts', () => 'openModal("keys")'], ['Pick for me', () => 'openModal("pick")'],
    ['New list', () => 'openModal("listnew")'], ['New tier list', () => 'openModal("tiernew")'], ['Artwork', () => 'openModal("covers")']];
  for (const [name, code] of dialogs) {
    await ev(code => { if (ui.modal) closeModal(); (0, eval)(code); }, code()); await p.waitForTimeout(350);
    await sweep(name + ' dialog');
  }
  await ev(() => ui.modal && closeModal());

  // "Skip to content" is the first thing Tab reaches, and takes you past the top bar and sidebar
  await p.focus('.skip'); await p.waitForTimeout(250);
  const skip = await ev(() => ({ first: document.querySelector('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])').className,
    seen: document.querySelector('.skip').getBoundingClientRect().top >= 0 }));
  await p.keyboard.press('Enter'); await p.waitForTimeout(100);
  ok('"Skip to content" comes first, shows when reached, and moves focus to the page', skip.first === 'skip' && skip.seen && await ev(() => document.activeElement && document.activeElement.id === 'main'), JSON.stringify(skip));

  // focus comes back to whatever opened the dialog
  await ev(() => goTab('library')); await p.waitForTimeout(250);
  const opener = '[data-act="open"][data-id]';
  await p.focus(opener); await p.keyboard.press('Enter'); await p.waitForSelector('.modal'); await p.waitForTimeout(200);
  let st = await ev(() => !!document.activeElement && !!document.activeElement.closest('.modal, #overlay'));
  ok('opening an item card moves focus into it', st);
  await p.keyboard.press('Escape'); await p.waitForTimeout(250);
  st = await ev(sel => document.activeElement && document.activeElement.matches(sel), opener);
  ok('closing it puts focus back on the card that opened it', st, await ev(() => document.activeElement && document.activeElement.outerHTML.slice(0, 80)));

  // on a phone
  await p.setViewportSize({ width: 390, height: 844 });
  for (const [name, code] of [['the library on a phone', "goTab('library')"], ['the overview on a phone', "goTab('overview')"], ['Settings on a phone', "goSettings('general')"]]) {
    await ev(code => (0, eval)(code), code); await p.waitForTimeout(300);
    await sweep(name);
  }
  st = await ev(() => document.documentElement.scrollWidth <= innerWidth + 1);
  ok('nothing scrolls sideways at 390 px', st, String(await ev(() => document.documentElement.scrollWidth)));
  await p.setViewportSize({ width: 1280, height: 800 });

  // the privacy and terms page
  await p.goto('file://' + path.join(ENV.ROOT, 'public/privacy.html')); await p.waitForTimeout(300);
  await sweep('the privacy and terms page');

  ok('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
})().catch(e => { console.log('FAIL ' + e.message.split('\n')[0]); process.exit(1); });
