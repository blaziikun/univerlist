// The Learning Centre (an official extension, empty to start), the menu line, Dramas as Film & TV shelves, a score scale per
// title, and search results split by type. University pages are stood in for by local copies.
const ENV = require('./env.cjs');
const { chromium } = require('playwright'); const { setup } = require('./mocks.cjs');
const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
const CORS = { 'access-control-allow-origin': '*' };
// a programme page: years as headings, modules in a table and a list, optional ones under their own heading
const PROGRAMME = `<html><body><nav><a href="/">Home</a><a href="/study">Study</a></nav><h1>Aeronautical Engineering MEng</h1>
  <h2>Year 1</h2><table><tr><th>Code</th><th>Module</th><th>Credits</th></tr>
    <tr><td>AERO40001</td><td>Mathematics 1</td><td>15</td></tr><tr><td>AERO40002</td><td>Aerostructures 1</td><td>10</td></tr><tr><td>AERO40003</td><td>Fluid Mechanics 1</td><td>10</td></tr></table>
  <h2>Year 2</h2><ul><li><a href="/m/AERO50001">AERO50001 Aerodynamics 2 (15 credits)</a></li><li>AERO50002 – Flight Mechanics (10 credits)</li></ul>
  <h3>Optional modules</h3><ul><li>AERO50010 Spacecraft Propulsion (5 ECTS)</li><li>AERO50011 Philosophy of Mind (5 ECTS)</li></ul>
  <footer><p>© 2026 Example University</p></footer></body></html>`;
// a Talis Aspire list, as its own data: two sections, in order
const R = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', RL = 'http://purl.org/vocab/resourcelist/schema#', DC = 'http://purl.org/dc/terms/', BIBO = 'http://purl.org/ontology/bibo/', FOAF = 'http://xmlns.com/foaf/0.1/';
const u = v => [{ type: 'uri', value: v }], l = v => [{ type: 'literal', value: v }];
const TALIS = { 'https://x.rl.talis.com/lists/abc': { [R + 'type']: u(RL + 'List'), [R + '_1']: u('s1'), [R + '_2']: u('s2') },
  s1: { [R + 'type']: u(RL + 'Section'), [DC + 'title']: l('Essential reading'), [R + '_1']: u('i1'), [R + '_2']: u('i2') },
  s2: { [R + 'type']: u(RL + 'Section'), [DC + 'title']: l('Further reading'), [R + '_1']: u('i3') },
  i1: { [RL + 'resource']: u('r1'), [RL + 'importance']: u(RL + 'ImportanceEssential') }, i2: { [RL + 'resource']: u('r2') }, i3: { [RL + 'resource']: u('r3') },
  r1: { [DC + 'title']: l('Fundamentals of Aerodynamics'), [BIBO + 'authorList']: u('al1'), [DC + 'date']: l('2017'), [BIBO + 'isbn13']: l('9781259129919') }, al1: { [R + '_1']: u('p1') }, p1: { [FOAF + 'name']: l('John D. Anderson') },
  r2: { [DC + 'title']: l('Aerodynamics for Engineering Students'), [DC + 'creator']: u('p2') }, p2: { [FOAF + 'name']: l('E. L. Houghton') },
  r3: { [DC + 'title']: l('Theory of Wing Sections'), [DC + 'creator']: u('p3') }, p3: { [FOAF + 'name']: l('Ira H. Abbott') } };
// a module's own page with its reading list in Harvard style
const MODPAGE = `<html><body><h1>AERO50002 Flight Mechanics</h1><p>Learn how aircraft fly.</p><h2>Reading list</h2><ul>
  <li>Etkin, B. (1996) <i>Dynamics of Flight: Stability and Control</i>. 3rd edn. New York: Wiley.</li>
  <li>Cook, M.V. (2012) <i>Flight Dynamics Principles</i>. Oxford: Butterworth-Heinemann.</li>
  <li><a href="/library">Library guide</a></li></ul></body></html>`;
(async () => {
  const b = await chromium.launch(ENV.launch), c = await b.newContext({ viewport: { width: 1400, height: 900 } }); await setup(c);
  await c.route('https://www.example.ac.uk/**', r => r.request().url().includes('/m/AERO50002') ? r.fulfill({ status: 200, contentType: 'text/html', headers: CORS, body: MODPAGE }) : r.fulfill({ status: 200, contentType: 'text/html', headers: CORS, body: PROGRAMME }));
  await c.route('https://x.rl.talis.com/**', r => r.request().url().endsWith('.json') ? r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(TALIS) }) : r.fulfill({ status: 200, contentType: 'text/html', headers: CORS, body: '<div id="app"></div>' }));
  await c.route('https://blocked.example.ac.uk/**', r => r.abort());
  const p = await c.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); const ev = (f, a) => p.evaluate(f, a);
  await p.goto(ENV.APP); await p.waitForTimeout(800); await p.fill('#wl-name', 'T'); await p.click('[data-act="welcome-done"]');

  // ---- empty, and an official extension ----
  let st = await ev(() => ({ courses: meta.courses, ac: (({ name, space, extra }) => ({ name, space, extra }))(meta.modes.find(x => x.id === 'academic')), main: allModes().map(x => x.id), spaces: spaceModes().map(x => x.id), dramas: meta.modes.some(x => x.id === 'dramas') }));
  ok('it starts empty: no subjects, no paths', st.courses.v === 2 && !st.courses.subjects.length && !st.courses.paths.length, JSON.stringify(st.courses));
  ok('the Learning Centre is a mode right after Games, and an extension you can switch off', st.ac.space === 'learning-centre' && st.ac.name === 'Learning Centre' && st.main.indexOf('academic') === st.main.indexOf('games') + 1 && st.spaces.join() === 'academic', JSON.stringify(st));
  ok('its tabs: Library, Courses, Curricula (pathways open inside their course)', st.ac.extra.join() === 'learn,curricula' && (await ev(() => (setMode('academic'), tabsFor().slice(0, 3).join()))) === 'library,learn,curricula', st.ac.extra.join());
  ok('it has a shortcut like the other modes (⇧6)', await ev(() => allModes()[5].id === 'academic'));
  await ev(() => setMode('universal'));
  ok('no Dramas mode for a new library', !st.dramas);
  ok('it is listed under Settings › Extensions › Built in', await ev(() => (goSettings('ext'), !!document.querySelector('[data-builtin="learning-centre"]'))));

  // ---- the line in the menus, with Watch & read on and off ----
  const lines = () => ev(() => { ui.page = 'profile'; ui.modeMenu = true; render(); const mm = document.querySelector('.modemenu'), sd = document.querySelector('#side');
    return { menu: !!(mm && mm.querySelector('.msep')), side: !!(sd && sd.querySelector('.nsep')), lc: !!(mm && [...mm.querySelectorAll('[data-k="academic"]')].length), after: mm ? [...mm.children].findIndex(x => x.dataset.k === 'academic') < [...mm.children].findIndex(x => x.classList.contains('msep')) : false }; });
  let L = await lines(); ok('the mode menu: Games, Learning Centre, the line, then Watch & read', L.menu && L.side && L.lc && L.after, JSON.stringify(L));
  await ev(() => builtinSet('watch-read', false)); L = await lines();
  ok('…and keeps the line with Watch & read switched off', L.menu && L.side, JSON.stringify(L));
  await ev(() => builtinSet('watch-read', true));

  // ---- switched off: academic books go to Literature ----
  const bid = await ev(() => addItem({ medium: 'book', kind: 'Academic', title: 'Calculus', creator: 'Michael Spivak', status: 'want', subject: 'Mathematics' }));
  const where = () => ev(i => ({ lit: modeItems(modeById('novels')).some(x => x.id === i), hub: modeItems(modeById('universal')).some(x => x.id === i), lc: spaceModes().length ? modeItems(modeById('academic')).some(x => x.id === i) : false }), bid);
  let W = await where(); ok('on: an academic book is in the Learning Centre, not Literature or Hub', W.lc && !W.lit && !W.hub, JSON.stringify(W));
  await ev(() => { setMode('academic'); builtinSet('learning-centre', false); });
  W = await where(); st = await ev(() => ({ mode: curMode().id, menu: (ui.modeMenu = true, render(), !!document.querySelector('.modemenu [data-k="academic"]')) }));
  ok('off: it shows under Literature (and Hub), the space is gone from the menu, and you\'re moved out of it', W.lit && W.hub && !W.lc && !st.menu && st.mode === 'universal', JSON.stringify({ W, st }));
  ok('…and it can\'t be opened while off', await ev(() => { setMode('academic'); return curMode().id !== 'academic'; }));
  await ev(() => builtinSet('learning-centre', true));

  // ---- subjects ----
  await ev(() => { setMode('academic'); goTab('learn'); }); await p.waitForTimeout(200);
  await ev(() => goTab('learn')); await p.waitForTimeout(150);
  await p.fill('[data-learnnew]', 'Aeronautics'); await p.press('[data-learnnew]', 'Enter'); await p.waitForTimeout(200);
  st = await ev(() => ({ subs: ACS().subjects.map(s => s.name), open: ui.learnSub }));
  ok('a subject you add, opened', st.subs.join() === 'Aeronautics' && !!st.open, JSON.stringify(st));
  await p.fill('[data-learnfield]', 'Aerodynamics'); await p.press('[data-learnfield]', 'Enter'); await p.waitForTimeout(150);
  await p.click('[data-act="learn-lvl"][data-l="2"]'); await p.waitForTimeout(150);
  ok('its fields, rated on the scale (optional)', await ev(() => ACS().subjects[0].fields.Aerodynamics.lvl === 2 && /Undergraduate/.test(document.querySelector('.lfield .ln').textContent)));

  // ---- a course's years and modules, fetched from a university's programme page ----
  const aeroId = await ev(() => ACS().subjects[0].id);
  await ev(() => { ui.learnSub = ui.pwId = null; renderMain(); }); await p.waitForTimeout(100);
  await p.click('[data-act="lc-newpath"]'); await p.waitForSelector('#lcn-uni');
  await p.selectOption('#lcn-sub', aeroId); await p.fill('#lcn-uni', 'Example University'); await p.fill('#lcn-prog', 'MEng');
  await p.fill('#lcn-url', 'https://www.example.ac.uk/aero/modules'); await p.fill('#lcn-about', 'The whole degree, years 1 and 2 to start with.');
  await p.click('[data-act="lc-create"][data-k="fetch"]'); await p.waitForSelector('[data-act="lci-fetch"]'); await p.click('[data-act="lci-fetch"]');
  await p.waitForSelector('[data-act="lci-save"]', { timeout: 10000 });
  let rows = await ev(() => ui.modal.rows.map(r => [r.stage, r.code, r.name, r.credits, r.core]));
  ok('the module list is read: codes, names, credits, by year', rows.length === 7 && rows[0].join('|') === 'Year 1|AERO40001|Mathematics 1|15|true' && rows[3].slice(0, 4).join('|') === 'Year 2|AERO50001|Aerodynamics 2|15', JSON.stringify(rows));
  ok('…optional ones marked as options, nothing from the menus or footer', rows[5][4] === false && rows[6][4] === false && !rows.some(r => /Home|Study|©/.test(r[2])), JSON.stringify(rows.slice(4)));
  await p.uncheck('[data-lcikeep="6"]'); await p.fill('[data-lci="5"][data-f="name"]', 'Spacecraft Propulsion (option)'); await p.press('[data-lci="5"][data-f="name"]', 'Tab');
  await p.click('[data-act="lci-save"]'); await p.waitForTimeout(300);
  st = await ev(() => { const P = pwCur(); return { name: P.name, uni: P.uni, sub: ACS().subjects[0].id === P.sub, stages: P.stages.map(s => s.name), mods: P.modules.map(m => m.name), y2: P.modules.filter(m => P.stages.find(s => s.id === m.stage).name === 'Year 2').length }; });
  ok('saved as the path\'s stages and modules, with your edits, minus the one you unticked', st.stages.join() === 'Year 1,Year 2' && st.mods.length === 6 && st.mods.includes('Spacecraft Propulsion (option)') && !st.mods.includes('Philosophy of Mind') && st.y2 === 3 && st.sub, JSON.stringify(st));
  if (process.env.SHOTS) await p.screenshot({ path: ENV.OUT + '/lc-path.png', fullPage: true });
  ok('the path page shows the modules', await ev(() => document.querySelectorAll('.lcmod').length === 6 && document.querySelectorAll('.lcstage').length >= 2));

  // ---- a module's reading list from Talis Aspire ----
  const aid = await ev(() => pwCur().modules.find(m => m.code === 'AERO50001').id);
  await p.click(`[data-act="lc-open"][data-k="${aid}"]`); await p.waitForTimeout(100);
  await p.click(`[data-act="lc-import"][data-m="${aid}"]`); await p.waitForSelector('#lci-url');
  await p.fill('#lci-url', 'https://x.rl.talis.com/lists/ABCDEF01-2345-6789-ABCD-EF0123456789.html'); await p.click('[data-act="lci-fetch"]');
  await p.waitForSelector('[data-act="lci-save"]', { timeout: 10000 });
  if (process.env.SHOTS) await p.screenshot({ path: ENV.OUT + '/lc-review.png' });
  rows = await ev(() => ({ how: ui.modal.how, r: ui.modal.rows.map(r => [r.section, r.t, r.a, r.year, r.imp]) }));
  ok('a Talis Aspire list is read exactly, in order, with sections and authors', rows.how === 'Talis Aspire' && rows.r.length === 3 && rows.r[0].join('|') === 'Essential reading|Fundamentals of Aerodynamics|John D. Anderson|2017|core' && rows.r[2][0] === 'Further reading' && rows.r[1][2] === 'E. L. Houghton', JSON.stringify(rows));
  await p.click('[data-act="lci-save"]'); await p.waitForTimeout(300);
  st = await ev(i => { const P = pwCur(), B = P.books.filter(b => b.mod === i); return { n: B.length, order: B.map(b => b.t.split(' ')[0]), buckets: B.map(b => pwBucket(P, b)) }; }, aid);
  ok('saved under that module, in order, each waiting for the one before', st.n === 3 && st.order.join() === 'Fundamentals,Aerodynamics,Theory' && st.buckets.join() === 'ready,waiting,waiting', JSON.stringify(st));
  await ev(i => { const P = pwCur(), b = P.books.find(x => x.mod === i); pwSetState(P, b, 'reading'); renderMain(); }, aid);
  ok('starting the first one makes the next ready', await ev(i => { const P = pwCur(), B = P.books.filter(b => b.mod === i); return pwBucket(P, B[1]) === 'ready'; }, aid));

  // ---- a module page with a Harvard-style list, and editing ----
  const fid = await ev(() => pwCur().modules.find(m => m.code === 'AERO50002').id);
  await p.click(`[data-act="lc-open"][data-k="${fid}"]`); await p.waitForTimeout(100);
  await p.click(`[data-act="lc-import"][data-m="${fid}"]`); await p.fill('#lci-url', 'https://www.example.ac.uk/m/AERO50002'); await p.click('[data-act="lci-fetch"]');
  await p.waitForSelector('[data-act="lci-save"]', { timeout: 10000 });
  rows = await ev(() => ui.modal.rows.map(r => [r.t, r.a, r.year]));
  ok('a reading list on an ordinary page: titles, authors and years, not the page\'s other links', rows.length === 2 && rows[0].join('|') === 'Dynamics of Flight: Stability and Control|Etkin, B.|1996' && rows[1][0] === 'Flight Dynamics Principles', JSON.stringify(rows));
  await p.click('[data-act="lci-save"]'); await p.waitForTimeout(300);
  const second = await ev(i => pwCur().books.filter(b => b.mod === i)[1].id, fid);
  await p.click(`[data-act="lc-read-up"][data-k="${second}"]`); await p.waitForTimeout(150);
  ok('readings reorder with ↑', await ev(i => pwCur().books.filter(b => b.mod === i)[0].t === 'Flight Dynamics Principles', fid));
  await p.fill(`[data-lcaddread="${fid}"]`, 'Aircraft Performance, Anderson'); await p.press(`[data-lcaddread="${fid}"]`, 'Enter'); await p.waitForTimeout(150);
  ok('and you can add one by hand: "title, author"', await ev(i => { const B = pwCur().books.filter(b => b.mod === i); return B[2].t === 'Aircraft Performance' && B[2].a === 'Anderson'; }, fid));
  await p.fill(`[data-lcm="${fid}"][data-f="name"]`, 'Flight Mechanics & Control'); await p.press(`[data-lcm="${fid}"][data-f="name"]`, 'Tab'); await p.waitForTimeout(150);
  ok('modules are edited in place', await ev(i => lcMod(pwCur(), i).name === 'Flight Mechanics & Control', fid));
  // a module's topics, status and mark, and what the programme adds up to
  await p.fill(`[data-lctopicadd="${fid}"]`, 'Longitudinal stability'); await p.press(`[data-lctopicadd="${fid}"]`, 'Enter'); await p.waitForTimeout(100);
  await p.fill(`[data-lctopicadd="${fid}"]`, 'Lateral dynamics'); await p.press(`[data-lctopicadd="${fid}"]`, 'Enter'); await p.waitForTimeout(100);
  await p.check(`[data-lctopic="${fid}"][data-i="0"]`); await p.waitForTimeout(100);
  await p.fill(`[data-lcm="${fid}"][data-f="grade"]`, '72'); await p.press(`[data-lcm="${fid}"][data-f="grade"]`, 'Tab'); await p.waitForTimeout(100);
  await p.selectOption(`.lcmod.open select[data-f="status"]`, 'done'); await p.waitForTimeout(150);
  st = await ev(() => [...document.querySelectorAll('.lcprog .tile')].map(t => t.querySelector('.v').textContent + ' ' + t.querySelector('.k').textContent));
  ok('modules have topics to tick, a status and a mark; the programme adds up topics, credits and a weighted mark', st[0] === '2/2 Topics covered' && /^10\/\d+ Credits done$/.test(st[1]) && st[3] === '72.0 Credit-weighted mark', JSON.stringify(st));
  ok('all four views are there: Modules, Map, Stages, Threads', await ev(() => [...document.querySelectorAll('[data-act="pw-view"]')].map(b => b.textContent).join() === 'Modules,Map,Stages,Threads'));
  for (const v of ['map', 'stages', 'threads']){ await p.click(`[data-act="pw-view"][data-k="${v}"]`); await p.waitForTimeout(120); }
  ok('…each draws (map, stages, threads)', await ev(() => document.querySelectorAll('.pwbody.v-threads .pwplq').length >= 2));
  await p.click('[data-act="pw-view"][data-k="modules"]');

  // ---- can't be fetched: says so, and pasting works instead ----
  await p.click('[data-act="lc-import"]:not([data-m])'); await p.fill('#lci-url', 'https://blocked.example.ac.uk/list'); await p.click('[data-act="lci-fetch"]');
  await p.waitForSelector('.modal .err', { timeout: 15000 });
  ok('a page that can\'t be reached says so and opens the paste box', await ev(() => /Paste its text/.test(document.querySelector('.modal .err').textContent) && document.querySelector('.modal details').open));
  await p.fill('#lci-text', 'Year 3\nAERO60001 Aircraft Design (20 credits)\nAERO60002 Individual Project (30 credits)\nAERO60003 Avionics (10 credits)');
  await p.click('[data-act="lci-paste"]'); await p.waitForSelector('[data-act="lci-save"]');
  rows = await ev(() => ({ kind: ui.modal.found, r: ui.modal.rows.map(r => [r.stage, r.code, r.name, r.credits]) }));
  ok('pasted text is read the same way', rows.kind === 'modules' && rows.r.length === 3 && rows.r[0].join('|') === 'Year 3|AERO60001|Aircraft Design|20', JSON.stringify(rows));
  await p.click('[data-act="lci-save"]'); await p.waitForTimeout(200);
  ok('…and joins as Year 3', await ev(() => pwCur().stages.map(s => s.name).join() === 'Year 1,Year 2,Year 3'));

  // ---- Curricula: programmes compared topic by topic ----
  await ev(() => goTab('curricula')); await p.waitForTimeout(200);
  ok('Curricula starts empty, with a way in', await ev(() => /Nothing compared/.test(document.querySelector('.curr').textContent) && !!document.querySelector('[data-unitopicadd]')));
  for (const tp of ['Fluids — Aerodynamics', 'Fluids — Compressible flow', 'Flight — Flight mechanics']){ await p.fill('[data-unitopicadd]', tp); await p.press('[data-unitopicadd]', 'Enter'); await p.waitForTimeout(80); }
  await p.click('[data-act="uni-paste"]'); await p.fill('#up-uni', 'Imperial'); await p.fill('#up-name', 'Aeronautics MEng');
  await p.fill('#up-text', '★ Aerodynamics 2 — Anderson, Fundamentals of Aerodynamics\nCompressible Flow — Anderson, Modern Compressible Flow\n★ Flight Mechanics — Etkin, Dynamics of Flight'); await p.click('[data-act="uni-save"]'); await p.waitForTimeout(150);
  await p.click('[data-act="uni-paste"]'); await p.fill('#up-uni', 'MIT'); await p.fill('#up-name', 'Course 16');
  await p.fill('#up-text', '★ 16.100 Aerodynamics — Anderson, Fundamentals of Aerodynamics; Houghton, Aerodynamics for Engineering Students\nSpacecraft systems — Wertz, Space Mission Engineering'); await p.click('[data-act="uni-save"]'); await p.waitForTimeout(150);
  st = await ev(() => { const S = curS(curSid()); return { progs: S.progs.length, topics: S.topics.map(t => t.name).join(), rows: document.querySelectorAll('.unitable tbody tr:not(.uarea)').length, star: [...document.querySelectorAll('.unitable .uc.core')].length, twice: [...document.querySelectorAll('.ubk i')].some(i => i.textContent === '×2') }; });
  ok('pasted programmes are matched to topics (★ compulsory, ● offered) and a book set twice says ×2', st.progs === 2 && st.rows === 4 && st.star >= 2 && st.twice && /Spacecraft systems/.test(st.topics), JSON.stringify(st));
  await p.click('.ubk:has-text("Aerodynamics for Engineering Students")'); await p.waitForTimeout(100);
  await p.click('[data-act="uni-topath"]'); await p.waitForTimeout(250);
  st = await ev(() => { const P = pwCur(); return { name: P.name, view: P.view, books: P.books.map(b => b.t), th: P.threads }; });
  ok('your picks join the course\'s reading order: one thread per area, in order', st.name === 'Aeronautics' && st.books.includes('Aerodynamics for Engineering Students') && st.books.includes('Fundamentals of Aerodynamics') && st.th.join().endsWith('Fluids,Flight,Topics'), JSON.stringify(st));
  ok('…and the course is still one course with one reading order', await ev(() => ACS().subjects.length === 1 && PWS().length === 1));
  await ev(() => { ui.uniView = 'side'; goTab('curricula'); }); await p.waitForTimeout(100);
  ok('…and Side by side lists each programme\'s modules', await ev(() => document.querySelectorAll('.uniside .panel').length === 2));
  await ev(() => { ui.uniView = 'merged'; ui.pwId = PWS()[0].id; goTab('learn'); }); await p.waitForTimeout(150);
  ok('the course opens as one page: its title, then what to read and its modules', await ev(() => ui.tab === 'learn' && !!document.querySelector('.lsubj h2') && !!document.querySelector('.pwhead') && !!document.querySelector('.lfields')));

  // ---- two pathways for one course (an older library, or an import) become one, nothing lost ----
  await ev(() => { const Q = lcNewPath({ name: 'Maths for engineers', uni: 'Another University', about: 'Just the maths.', sub: PWS()[0].sub }); Q.books.push({ id: 'kreyszig', t: 'Advanced Engineering Mathematics', a: 'Kreyszig', st: 'reading', after: [] }); Q.goals = [{ id: 'g9', t: 'Finish Kreyszig', done: false }]; });
  await p.click('[data-act="learn-open"][data-k=""]'); await p.waitForTimeout(200);
  st = await ev(() => ({ paths: PWS().length, cards: [...document.querySelectorAll('.lcov .lcpath:not(.lcnew)')].map(x => x.querySelector('b').textContent), about: (document.querySelector('.lcpath .lcabout') || {}).textContent, uni: (document.querySelector('.lcpath .lcuni') || {}).textContent }));
  if (process.env.SHOTS){ await p.screenshot({ path: ENV.OUT + '/lc-overview.png' }); await ev(() => { ui.modeMenu = true; render(); }); await p.screenshot({ path: ENV.OUT + '/lc-menu.png', clip: { x: 0, y: 0, width: 700, height: 700 } }); await ev(() => { ui.modeMenu = false; render(); }); }
  ok('Courses: one card per course, with its university and summary', st.paths === 1 && st.cards.length === 1 && /Aeronautics/.test(st.cards[0]) && /whole degree/.test(st.about) && /Example University · MEng/.test(st.uni), JSON.stringify(st));
  await p.click('.lcov .lcpath:not(.lcnew)'); await p.waitForTimeout(200);
  st = await ev(() => { const P = pwCur(); return { books: P.books.map(b => b.t), goals: (P.goals || []).map(g => g.t), mods: (P.modules || []).length, merged: (document.querySelector('.lcmerged') || {}).textContent || '' }; });
  ok('…the second pathway\'s books and milestones are in the course, and where it came from is shown', st.books.includes('Advanced Engineering Mathematics') && st.goals.includes('Finish Kreyszig') && st.mods >= 6 && st.books.filter(t => t === 'Aerodynamics for Engineering Students').length === 1 && /Maths for engineers \(Another University\): Just the maths/.test(st.merged), JSON.stringify(st));

  st = await ev(() => { const Q = lcNewPath({ name: 'Number theory', sub: '' }); Q.books.push({ id: 'hw', t: 'An Introduction to the Theory of Numbers', a: 'Hardy & Wright', st: 'todo', after: [] }); const S = ACS().subjects.find(x => x.name === 'Number theory'); return { course: !!S, same: !!S && PWS().find(p => p.sub === S.id).books.some(b => b.id === 'hw') }; });
  ok('a pathway with no course becomes a course of its own, books and all', st.course && st.same, JSON.stringify(st));
  await ev(() => { const S = ACS().subjects.find(x => x.name === 'Number theory'); ACS().subjects = ACS().subjects.filter(x => x !== S); ACS().paths = ACS().paths.filter(p => p.sub !== S.id); });

  // ---- an older library: Academic and Dramas, migrated once ----
  st = await ev(() => {
    meta.modes = meta.modes.filter(x => x.id !== 'academic'); meta.modes.push({ id: 'academic', name: 'Academic', g: '∫', match: ['book:Academic'], extra: ['learn', 'paths', 'courses'], blocks: [{ k: 'courses', w: 8 }, { k: 'summary', w: 12 }], theme: 'library' });
    meta.modes.splice(4, 0, { id: 'dramas', name: 'Dramas', g: '❀', match: ['tv:K-drama'], theme: 'blossom' });
    const sc = modeById('screen'); sc.dramas2 = false; sc.dramasSplit = true; sc.match = ['film', '!film:Anime film', 'tv', '!tv:K-drama', '!tv:C-drama', '!tv:J-drama']; sc.shelves = [{ name: 'Films', match: ['film', '!film:Anime film'] }, { name: 'Series', match: ['tv'] }];
    meta.courses = { programmes: [{ id: 'x', name: 'Mathematics (BSc / MMath)', subject: 'Mathematics', years: [{ n: 1, modules: [{ id: 'm1', name: 'Analysis I', credits: 15, kind: 'core', status: 'taking', topics: [{ t: 'Real analysis', done: true }], readings: [] }] }] }],
      paths: [{ id: 'old', name: 'Maths', sub: 'maths', books: [{ id: 'spivak', t: 'Calculus', a: 'Michael Spivak', th: 'Analysis', st: 'reading', after: [] }, { id: 'rudin', t: 'Principles', a: 'Walter Rudin', th: 'Analysis', st: 'todo', after: [{ k: 'spivak', s: 'done' }] }] }],
      learn: { subjects: { maths: { fields: { 'Real & functional analysis': { lvl: 3 } }, goal: 4 } } } };
    const kd = addItem({ medium: 'tv', kind: 'K-drama', title: 'Crash Landing on You', status: 'done' }); items.get(kd).modeHome = 'dramas';
    migratePaths(); const ac = meta.modes.find(x => x.id === 'academic'), s2 = modeById('screen');
    const C = meta.courses, pw = C.paths.find(p => p.sub === 's-maths'), pr = pw; // the old pathway and programme: one course now
    return { ac: [ac.name, ac.space, ac.extra.join(), (ac.blocks || []).map(x => x.k).join()], courses: [C.v, C.subjects.filter(s => s.id === 's-maths').map(s => s.id + ':' + s.name + ':' + s.fields['Real & functional analysis'].lvl + ':' + s.goal).join(), pw && pw.sub, pw && pw.books.map(b => b.st).join(), pw && pwBucket(pw, pw.books[1]), pr && pr.stages[0].name, pr && pr.modules[0].name + '|' + pr.modules[0].status + '|' + pr.modules[0].topics.filter(t => t.done).length + ' topics'].join(' / '), dramas: meta.modes.some(x => x.id === 'dramas'), home: items.get(kd).modeHome || '', inScreen: modeItems(s2).some(x => x.id === kd),
      shelves: shelvesOf(s2).map(x => x.name), series: shelvesOf(s2).find(x => x.name === 'Series').test(items.get(kd)) };
  });
  ok('an old Academic becomes the Learning Centre, its own data carried over: levels, pathways (with progress and order), programmes', st.ac.join('|') === 'Learning Centre|learning-centre|learn,curricula|summary' && st.courses === '2 / s-maths:Mathematics:3:4 / s-maths / reading,todo / waiting / Year 1 / Analysis I|taking|1 topics', JSON.stringify(st));
  ok('an old Dramas mode goes; its dramas are in Film & TV under K-drama (shown because you have one)', !st.dramas && !st.home && st.inScreen && st.shelves.join() === 'Films,Series,K-drama' && !st.series, JSON.stringify(st));

  // ---- the old built-in content, as a personal file ----
  if (process.env.LC_CONTENT){
    await p.setInputFiles('#file-import', process.env.LC_CONTENT); await p.waitForSelector('[data-act="import-merge"]');
    const offered = await ev(() => document.querySelector('.modal').textContent);
    ok('the content file is offered as a Learning Centre part', /Learning Centre/.test(offered));
    await ev(() => { for (const k of Object.keys(ui.modal.sel)) ui.modal.sel[k] = k === 'academic'; }); await p.click('[data-act="import-merge"]'); await p.waitForFunction(() => !ui.modal, null, { timeout: 30000 });
    // several pathways in one course are one now: find a pathway by its old id, kept or folded in
    st = await ev(() => { const C = ACS(), from = id => C.paths.find(p => p.id === id || (p.merged || []).some(x => x.id === id)), m = from('lc-maths'), t = from('lcp-aero');
      return { subs: C.subjects.length, maths: C.subjects.filter(s => s.id === 's-maths').length, one: C.paths.length === new Set(C.paths.map(p => p.sub)).size, paths: C.paths.reduce((a, p) => a + 1 + (p.merged || []).length, 0), phd: m && [m.sub, m.books.length, m.books.filter(b => pwBucket(m, b) === 'ready').length > 0, m.books.filter(b => pwBucket(m, b) === 'waiting').length > 0].join(), cur: Object.values(C.curricula).reduce((a, c) => a + c.progs.length, 0), mathsTopics: (C.curricula['s-maths'] || { topics: [] }).topics.length, aero: t && [t.stages.length, t.modules.length, t.modules[0].topics.length > 0].join() }; });
    ok('…and brings in every course, pathway, programme and curriculum (no duplicate courses, one pathway each)', st.subs >= 12 && st.maths === 1 && st.one && st.paths >= 22 && st.cur >= 24 && st.mathsTopics > 20, JSON.stringify(st));
    ok('…pathways keep what each book waits for; programmes keep their years and topics', /^s-maths,\d+,true,true$/.test(st.phd) && /^\d+,\d+,true$/.test(st.aero), JSON.stringify(st));
    await ev(() => { setMode('academic'); ui.uniSub = 's-maths'; goTab('curricula'); }); await p.waitForTimeout(300);
    ok('…and Curricula shows the comparison table again (topics × programmes, books they set)', await ev(() => document.querySelectorAll('.unitable tbody tr:not(.uarea)').length > 20 && document.querySelectorAll('.unitable thead th').length > 6 && document.querySelectorAll('.ubk').length > 30));
    if (process.env.SHOTS) await p.screenshot({ path: ENV.OUT + '/lc-curricula.png' });
    await ev(() => { ui.pwId = null; ui.learnSub = 's-maths'; goTab('learn'); }); await p.waitForTimeout(200);
    ok('…and each course is one page, with what was folded into it listed', await ev(() => !!document.querySelector('.lsubj h2') && !!document.querySelector('.lcmerged')));
    if (process.env.SHOTS) await p.screenshot({ path: ENV.OUT + '/lc-content.png' });
  }

  // ---- a score scale for one title ----
  const fm = await ev(() => addItem({ medium: 'film', title: 'Perfect Days', status: 'done' }));
  await ev(i => openItem(i), fm); await p.waitForSelector('#it-scale');
  await p.selectOption('#it-scale', '5'); await p.waitForTimeout(200);
  await p.click('.stars [data-act="rate"][data-k="9"]'); await p.waitForTimeout(200);
  st = await ev(i => ({ r: items.get(i).rating, sc: items.get(i).scale, shown: document.querySelector('.bigscore').textContent, usual: meta.settings.ratingScale, other: fmtScore(9) }), fm);
  ok('one film in stars: 4½★ is stored as 9/10, shown as stars, your usual scale untouched', st.r === 9 && st.sc === '5' && st.shown === '★★★★½' && st.usual === '10d' && st.other === '9', JSON.stringify(st));
  ok('…so it ranks next to a 9/10 from anything else', await ev(i => { const a = addItem({ medium: 'film', title: 'Other', status: 'done', rating: 9 }); return items.get(i).rating === items.get(a).rating; }, fm));
  await ev(() => closeModal());

  // ---- search: anime and manga apart ----
  await ev(() => focusSearch()); await p.fill('#gq', 'Horimiya'); await p.waitForTimeout(1500);
  st = await ev(() => { const col = [...document.querySelectorAll('.gscol')].find(x => /Culture/.test(x.querySelector('.gsg').textContent)); return col ? [...col.querySelectorAll('.gssub')].map(x => x.textContent) : null; });
  ok('Culture\'s results are split: Anime, then Manga', st && st.join() === 'Anime,Manga', JSON.stringify(st));

  // ---- Courses: Academic and Interests, always shown apart ----
  await ev(() => { ui.pwId = null; ui.learnSub = null; setMode('academic'); goTab('learn'); }); await p.waitForTimeout(200);
  st = await ev(() => ({ heads: [...document.querySelectorAll('.learn .lkindh h3')].map(h => h.textContent), adds: document.querySelectorAll('[data-learnnew]').length }));
  ok('Courses shows Academic and Interests, each with its own add box', st.heads.join() === 'Academic,Interests' && st.adds === 2, JSON.stringify(st));
  await p.fill('[data-learnnew="arts"]', 'Music theory'); await p.press('[data-learnnew="arts"]', 'Enter'); await p.waitForTimeout(200);
  ok('…and one added under Interests is an interest', await ev(() => (ACS().subjects.find(s => s.name === 'Music theory') || {}).kind === 'arts'));

  ok('no page errors', !errs.length, errs.slice(0, 3).join(' / '));
  await b.close(); process.exit(0);
})();
