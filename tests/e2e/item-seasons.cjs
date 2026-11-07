// A show's seasons on its card: "+ Season" adds one to that show, and the seasonal chart's own add button (a
// different name) still adds the anime it's on. They once shared a name, and the chart's handler won.
const ENV = require('./env.cjs');
const { chromium } = require('playwright'); const { setup } = require('./mocks.cjs');
const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
(async () => {
  const b = await chromium.launch(ENV.launch), c = await b.newContext(); await setup(c);
  const p = await c.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); const ev = (f, a) => p.evaluate(f, a);
  await p.goto(ENV.APP); await p.waitForTimeout(800); await p.fill('#wl-name', 'T'); await p.click('[data-act="welcome-done"]');
  const id = await ev(() => addItem({ medium: 'tv', title: 'Severance', status: 'active' }));
  await ev(id => { openItem(id); patch(id, { bySeason: true }, 'Seasons'); renderOverlay(); }, id);
  await p.waitForSelector('.modal [data-act="season-add"]');
  await p.click('.modal [data-act="season-add"]'); await p.click('.modal [data-act="season-add"]'); await p.waitForTimeout(150);
  let st = await ev(id => ({ n: (items.get(id).seasons || []).length, count: items.size }), id);
  ok('"+ Season" adds a season to the show', st.n === 2, JSON.stringify(st));
  ok('…and adds nothing else to the library', st.count === 1, JSON.stringify(st));
  const chart = require('fs').readFileSync(require('path').join(__dirname, '../../src/features/insights/mode-pages.js'), 'utf8');
  ok('the seasonal chart\'s add button has its own name', chart.includes('data-act="seasonal-add"') && !chart.includes('data-act="season-add"'));

  ok('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
})().catch(e => { console.log('FAIL ' + e.message.split('\n')[0]); process.exit(1); });
