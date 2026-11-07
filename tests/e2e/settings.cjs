// Settings, all Svelte: each section draws, every choice shows the moment you make it (not only after leaving and
// coming back), what you're typing survives a redraw, and the private collection, keys, modes and themes behave.
const ENV = require('./env.cjs');
const { chromium } = require('playwright');
const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
(async () => {
  const b = await chromium.launch(ENV.launch), c = await b.newContext({ viewport: { width: 1300, height: 900 } }); const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (f, a) => p.evaluate(f, a);
  const go = async s => { await ev(s => goSettings(s), s); await p.waitForSelector(`.setsec[data-sec="${s}"]`); await p.waitForTimeout(150); };
  const pressed = () => ev(() => [...document.querySelectorAll('.setsec [aria-pressed="true"]')].map(x => x.textContent.trim()));
  await p.goto(ENV.APP); await p.waitForTimeout(800); await p.fill('#wl-name', 'T'); await p.click('[data-act="welcome-done"]');

  // ----- every section draws -----
  const secs = await ev(() => setSecs().map(([k]) => k));
  const drawn = [];
  for (const s of secs) { if (s === 'account') continue; await go(s); if (await ev(s => (document.querySelector(`.setsec[data-sec="${s}"]`).innerText || '').trim().length > 20, s)) drawn.push(s); }
  ok('every section draws', drawn.length === secs.filter(s => s !== 'account').length, drawn.join(' '));

  // ----- a choice shows straight away -----
  await go('library'); await p.click('.setsec button:has-text("Compact")');
  ok('Library: the density you pick lights up at once', (await pressed()).includes('Compact') && (await ev(() => meta.settings.density)) === 'compact');
  await go('general'); await p.click('.setsec button:has-text("Nov 1, 2026")');
  ok('General: so does the date format', (await pressed()).includes('Nov 1, 2026'));

  // ----- Advanced -----
  await go('advanced');
  await p.fill('#set-appname', 'MyShelf'); await p.waitForTimeout(100);
  await p.fill('[data-speed="page"]', '3'); await p.dispatchEvent('[data-speed="page"]', 'change'); await p.waitForTimeout(100);
  let st = await ev(() => ({ title: document.title, name: meta.settings.appName, page: meta.settings.speeds.page }));
  ok('Advanced: the app name and reading speed save as you change them', st.title === 'MyShelf' && st.name === 'MyShelf' && +st.page === 3, JSON.stringify(st));

  // ----- Appearance -----
  await go('appearance');
  const other = await ev(() => themeList().map(([k]) => k).find(k => k !== editThemeId()));
  await p.click(`.setsec [data-act="theme-edit"][data-k="${other}"]`); await p.waitForTimeout(150);
  ok('Appearance: picking a theme card edits that theme', await ev(o => editThemeId() === o && document.querySelector('.setsec .note').innerText.includes(resolveTheme(o).name), other));
  await p.evaluate(() => { const r = document.querySelector('.setsec input[type="range"][data-theme="radius"]'); r.value = '7'; r.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(120);
  st = await ev(() => ({ out: document.querySelector('.setsec input[data-theme="radius"]').nextElementSibling.textContent, saved: resolveTheme(editThemeId()).radius }));
  ok('…a slider applies as you drag, with its number beside it', st.out === '7px' && st.saved === 7, JSON.stringify(st));
  const back = await ev(() => themeList().map(([k]) => k).find(k => k !== editThemeId()));
  await p.click(`.setsec [data-act="theme-edit"][data-k="${back}"]`); await p.waitForTimeout(150);
  st = await ev(() => ({ out: document.querySelector('.setsec input[data-theme="radius"]').nextElementSibling.textContent, want: resolveTheme(editThemeId()).radius + 'px' }));
  ok('…and shows the other theme\'s number when you switch', st.out === st.want, JSON.stringify(st));
  await p.click('.setsec button[data-act="set-amb"][data-k="alive"]'); await p.waitForTimeout(100);
  ok('…movement: Alive lights up and applies', (await pressed()).includes('Alive') && (await ev(() => document.documentElement.dataset.amb)) === 'alive');

  // ----- Modes -----
  await go('modes');
  const second = await ev(() => meta.modes[1].id);
  await p.click(`.setsec [data-act="edit-mode"][data-k="${second}"]`); await p.waitForTimeout(150);
  ok('Modes: picking a mode shows its name', (await p.inputValue('#mode-name')) === (await ev(id => modeById(id).name, second)));
  // typing survives a redraw from somewhere else
  await p.click('#mode-name'); await p.keyboard.press('End'); await p.keyboard.type(' X');
  await ev(() => render()); await p.waitForTimeout(150);
  st = await ev(() => ({ val: document.querySelector('#mode-name').value, focus: document.activeElement && document.activeElement.id }));
  ok('…what you\'re typing stays put when the page redraws', st.val.endsWith(' X') && st.focus === 'mode-name', JSON.stringify(st));
  await p.dispatchEvent('#mode-name', 'change'); await p.waitForTimeout(100);
  ok('…and saves', (await ev(id => modeById(id).name, second)).endsWith(' X'));
  await p.click('.setsec [data-act="mode-shelfmode"][data-k="custom"]'); await p.waitForTimeout(150);
  const n0 = await p.locator('.setsec .shrow').count();
  await p.click('.setsec [data-act="shelf-add"]'); await p.waitForTimeout(150);
  ok('…my own shelves, and + Shelf adds one', (await p.locator('.setsec .shrow').count()) === n0 + 1, n0 + ' → ' + (await p.locator('.setsec .shrow').count()));
  await p.click('.setsec summary:has-text("Copy or delete")');
  await p.click('.setsec [data-act="mode-del"]'); await p.waitForTimeout(100);
  ok('…delete asks first', await p.isVisible('.setsec [data-act="mode-del-yes"]'));
  await p.click('.setsec [data-act="mode-del-no"]'); await p.waitForTimeout(100);
  ok('…and Keep keeps it', (await ev(id => !!meta.modes.find(m => m.id === id), second)) && !(await p.isVisible('.setsec [data-act="mode-del-yes"]')));

  // ----- Data, sources & keys -----
  await go('data');
  ok('Data: a key is hidden until you press the eye', (await p.getAttribute('#key-tmdb', 'type')) === 'password');
  await p.click('.setsec [data-act="key-eye"][data-k="tmdb"]'); await p.waitForTimeout(80);
  ok('…and shows when you do', (await p.getAttribute('#key-tmdb', 'type')) === 'text');
  await ev(() => { KEYS.tmdb = 'test-key'; render(); }); await p.waitForTimeout(100);
  await p.click('.setsec [data-act="export-open"]'); await p.click('.modal [data-act="export-zip"]'); await p.waitForTimeout(200);
  ok('…with a key saved, Download everything with no passphrase asks first, so the key isn\'t left out by surprise', await p.isVisible('#exp-ask'));
  await ev(() => { KEYS.tmdb = ''; ui.expAsk = false; closeModal(); render(); });
  await p.click('.setsec [data-act="erase"]'); await p.waitForTimeout(100);
  ok('…Erase asks first', await p.isVisible('.setsec [data-act="erase-yes"]'));
  await p.click('.setsec [data-act="erase-no"]'); await p.waitForTimeout(100);
  ok('…and Keep keeps everything', !(await p.isVisible('.setsec [data-act="erase-yes"]')) && (await ev(() => meta.modes.length)) > 2);

  // ----- Private collection -----
  await go('privacy');
  await p.fill('#vp1', 'secret-pass'); await p.fill('#vp2', 'secret-pass'); await p.click('.setsec [data-act="vault-create"]');
  await p.waitForSelector('.setsec [data-act="vault-lock"]', { timeout: 10000 });
  ok('Private: made, and open', /Unlocked/.test(await p.innerText('.setsec[data-sec="privacy"]')));
  await p.fill('[data-spkind="film"]', 'Secret cut'); await p.dispatchEvent('[data-spkind="film"]', 'change'); await p.waitForTimeout(200);
  st = await ev(() => ({ chips: [...document.querySelectorAll('.setsec .sptypes .chip')].map(x => x.textContent), box: document.querySelector('[data-spkind="film"]').value, kept: vault.prefs.kinds.film }));
  ok('…a private type is added, and its box empties', st.chips.some(x => x.includes('Secret cut')) && st.box === '' && st.kept.includes('Secret cut'), JSON.stringify(st));
  await p.fill('#sp-lname', 'Mine'); await p.fill('#sp-lurl', 'https://example.org/s?q={q}'); await p.click('.setsec [data-act="sp-link-add"]'); await p.waitForTimeout(200);
  st = await ev(() => ({ links: vault.prefs.links.length, shown: document.querySelectorAll('.setsec .splinks b').length, name: document.querySelector('#sp-lname').value }));
  ok('…a search link is added, and the boxes empty', st.links === 1 && st.shown === 1 && st.name === '', JSON.stringify(st));
  await p.click('.setsec [data-act="vault-lock"]'); await p.waitForTimeout(400);
  ok('…Lock now locks it, and its own settings disappear', /Locked/.test(await p.innerText('.setsec[data-sec="privacy"]')) && !(await p.isVisible('#sp-lname')));

  // ----- Extensions -----
  await go('ext');
  await p.click('.setsec summary:has-text("Learning Centre")'); await p.waitForTimeout(100);
  await p.click('.setsec label.sw:has(input[data-builtin="backdrops"])'); await p.waitForTimeout(250);
  st = await ev(() => ({ on: builtinOn('backdrops'), nav: /Backdrops/.test(document.querySelector('.setsecs').innerText), open: document.querySelector('.setsec details[data-bopen="learning-centre"]').open }));
  ok('Extensions: switching on a built-in shows its section, and what you unfolded stays unfolded', st.on && st.nav && st.open, JSON.stringify(st));

  // ----- odd things in imported data don't break Settings -----
  st = await ev(async () => {
    const dup = clone(meta.modes[1]);
    await applyParts({ preferences: { modes: [...clone(meta.modes), dup] } }, { preferences: true }, 'merge');
    return { modes: meta.modes.length, unique: new Set(meta.modes.map(m => m.id)).size };
  });
  ok('an import with two modes of the same id keeps one', st.modes === st.unique, JSON.stringify(st));
  await ev(() => { meta.settings.keys = { ...(meta.settings.keys || {}), search: ['x', 'x'] }; markDirty(); render(); });
  await go('keys');
  ok('a keybind listed twice still draws', (await ev(() => document.querySelector('.setsec[data-sec="keys"]').innerText.length)) > 50);
  await ev(() => { meta.profile.banner = "https://x.example/a.png\"); position: fixed; inset: 0; z-index: 9999; background: url(\"https://evil.example/b.png"; markDirty(); render(); });
  await go('general');
  st = await ev(() => { const el = document.querySelector('.gpban'); return { pos: getComputedStyle(el).position, bg: el.style.backgroundImage }; });
  ok('a banner address can only ever be the banner, not restyle the page', st.pos !== 'fixed' && /^url\(/.test(st.bg), JSON.stringify(st));
  await ev(() => { meta.profile.banner = ''; markDirty(); render(); });

  // ----- What's in here: the guide, also Svelte -----
  await p.click('.settings .setdocs'); await p.waitForSelector('.guide .gtoc', { timeout: 5000 });
  st = await ev(() => ({ toc: [...document.querySelectorAll('.gtoc a')].map(a => a.textContent), page: ui.page }));
  ok('What\'s in here opens the guide, with Account & sync, Music and Backdrops in it', st.page === 'features' && ['Account & sync (an official extension)', 'Music', 'Themes and backdrops'].every(t => st.toc.includes(t)), st.toc.join(' / '));
  await p.click('.mdoc input[data-guidecheck="c0"]'); await p.waitForTimeout(100);
  await go('general'); await p.click('.settings .setdocs'); await p.waitForSelector('.guide .gtoc');
  ok('…a ticked start step stays ticked', await ev(() => meta.settings.guideChecks.c0 === true && document.querySelector('.mdoc input[data-guidecheck="c0"]').checked));
  await go('general');
  ok('…and going back to Settings swaps the page cleanly', await ev(() => !document.querySelector('.guide') && !!document.querySelector('.settings')));

  // General › This device: how much space the library takes
  await ev(() => goSettings('general')); await p.waitForTimeout(600);
  const space = await ev(() => (document.querySelector('#main').innerText.match(/Your library takes [^.]+\./) || [''])[0]);
  ok('Settings › General says how much space the library takes', /takes \d/.test(space), space);

  ok('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
})().catch(e => { console.log('FAIL ' + e.message.split('\n')[0]); process.exit(1); });
