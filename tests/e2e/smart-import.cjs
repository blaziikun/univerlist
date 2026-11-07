// Smart import: a pasted list (or any CSV) is looked up row by row, typos forgiven; scores in stars, fractions or
// percentages are understood and keep their scale; rows nothing matches are only added if you tick them
const ENV = require('./env.cjs');
const { chromium } = require('playwright'); const { setup } = require('./mocks.cjs');
const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
(async () => { const b = await chromium.launch(ENV.launch), c = await b.newContext(); await setup(c); const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (f, a) => p.evaluate(f, a);
  await p.goto(ENV.APP); await p.waitForTimeout(800); await p.fill('#wl-name', 'T'); await p.click('[data-act="welcome-done"]');
  ok('stars are 5-point', JSON.stringify(await ev(() => parseAnyScore('★★★★½'))) === '[9,"5"]');
  ok('a fraction keeps its scale', JSON.stringify(await ev(() => parseAnyScore('85/100'))) === '[8.5,"100"]');
  ok('a percentage', JSON.stringify(await ev(() => parseAnyScore('70%'))) === '[7,"100"]');
  ok('a column of small numbers is out of 5', await ev(() => columnScale('Rating', ['4', '3.5', '5', '2'])) === '5');
  ok('the header says out of 100', await ev(() => columnScale('Score (out of 100)', ['8'])) === '100');
  ok('typos still match', await ev(() => titleLike('White Colar', 'White Collar')) > .8);
  await ev(() => openModal('paste', { medium: 'tv', status: 'done' })); await p.waitForTimeout(150);
  await p.fill('#ps-text', 'White Colar (2009) - ★★★★½\nQwxzv Plorb Snerk - 8');
  await p.click('[data-act="ps-import"]');
  await p.waitForFunction(() => ui.modal && ui.modal.kind === 'smartmatch' && !ui.modal.running, null, { timeout: 20000 });
  const st = await ev(() => ui.modal.rows.map(x => [x.title, x.state, x.match && x.match.title]));
  ok('the typo is matched online', st[0][1] === 'matched' && st[0][2] === 'White Collar', JSON.stringify(st));
  ok('the nonsense isn\'t', st[1][1] === 'none', JSON.stringify(st));
  await p.click('[data-act="sm-import"]'); await p.waitForTimeout(300);
  const lib = await ev(() => [...items.values()].map(b => [b.title, b.rating, b.scale || '', b.ext && b.ext.tvmaze]));
  ok('imported under its real title, with the score as given', lib.some(x => x[0] === 'White Collar' && x[1] === 9 && x[2] === '5' && x[3]), JSON.stringify(lib));
  ok('nothing unmatched was created without asking', !lib.some(x => /Qwxzv/.test(x[0])), JSON.stringify(lib));
  ok('no page errors', !errs.length, errs.join(' | '));
  await b.close(); })();
