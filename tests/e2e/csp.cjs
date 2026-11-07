// The deployed site under its real security headers (public/_headers): nothing the app does is blocked by its own
// Content-Security-Policy, the page can't be framed, and an extension still runs (in ext-host.html, its own sandbox).
// Needs the site build: pnpm build (skips without it).
const fs = require('fs'), path = require('path'), http = require('http'); const ENV = require('./env.cjs');
const { chromium } = require('playwright'); const { setup } = require('./mocks.cjs');
const DIST = path.join(ENV.ROOT, 'dist'); if (!fs.existsSync(path.join(DIST, 'ext-host.html'))){ console.log('skip  needs the site build (pnpm build)'); process.exit(0); }
const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
// _headers, read the way Cloudflare does: rules in order, "! Name" takes a header back off
const rules = []; let cur = null;
for (const line of fs.readFileSync(path.join(DIST, '_headers'), 'utf8').split('\n')){ if (!line.trim() || line.startsWith('#')) continue;
  if (!/^\s/.test(line)){ cur = { pat: line.trim(), set: [], del: [] }; rules.push(cur); continue; }
  const t = line.trim(); if (t.startsWith('!')) cur.del.push(t.slice(1).trim().toLowerCase()); else { const i = t.indexOf(':'); cur.set.push([t.slice(0, i).toLowerCase(), t.slice(i + 1).trim()]); } }
const headersFor = p => { const h = {}; for (const r of rules){ const re = new RegExp('^' + r.pat.replace(/[.]/g, '\\.').replace(/\*/g, '.*') + '$'); if (!re.test(p)) continue; for (const d of r.del) delete h[d]; for (const [k, v] of r.set) h[k] = v; } return h; };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.zip': 'application/zip' };
const srv = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
  const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', ...headersFor(p) }); res.end(fs.readFileSync(f)); });
(async () => { await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}`;
  const b = await chromium.launch(ENV.launch), c = await b.newContext(); await setup(c); await c.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message + ' @ ' + String(e.stack).split('\n').slice(1,3).join(' '))); const ev = (f, a) => p.evaluate(f, a);
  await p.goto(base + '/'); await p.waitForTimeout(1200); await p.fill('#wl-name', 'T'); await p.click('[data-act="welcome-done"]');
  await ev(() => { addItem({ medium: 'anime', title: 'A', status: 'done', rating: 8, genres: ['Drama'] }); addItem({ medium: 'film', title: 'B', status: 'want' }); });
  for (const s of await ev(() => setSecs().map(x => x[0]))){ await ev(k => goSettings(k), s); await p.waitForTimeout(60); }
  for (const t of ['overview', 'library', 'rank', 'discover', 'favourites', 'stats', 'lists']){ await ev(t => { ui.page = 'profile'; ui.tab = t; render(); }, t); await p.waitForTimeout(60); }
  await ev(() => { ui.page = 'watch'; render(); }); await p.waitForTimeout(100);
  // an extension, the way it really runs on the site
  const fake = `univerlist.provide("watch.sources", async () => [{ name: "csp-ok", url: "http://127.0.0.1:9/v.mp4" }]);`;
  await ev(code => extInstall(new File([JSON.stringify({ id: 'csp-test', name: 'CSP test', permissions: ['watch.sources'], code })], 'csp-test.json', { type: 'application/json' })), fake).catch(() => {});
  await p.waitForTimeout(1500);
  ok('an extension still runs, in its own sandboxed page', await ev(() => [...EXT.frames.values()].some(F => F.jobs.has('watch.sources')) && !!document.querySelector('iframe[src="ext-host.html"]')));
  // an extension's own code reaches its companion and nothing else (its policy, extPolicy): here the companion is a small
  // server at 127.0.0.1, and "elsewhere" is the same server under another name, which the site's policy alone allows
  const comp = http.createServer((req, res) => { res.writeHead(200, { 'access-control-allow-origin': '*' }); res.end('ok'); });
  await new Promise(r => comp.listen(0, '127.0.0.1', r)); const port = comp.address().port;
  const probe = `univerlist.provide("watch.sources", async () => {
    const tryIt = u => fetch(u).then(() => "reached", () => "blocked");
    return [{ name: "companion " + await tryIt("http://127.0.0.1:${port}/health"), url: "x" }, { name: "elsewhere " + await tryIt("http://localhost:${port}/health"), url: "x" }];
  });`;
  await ev(([code, url]) => extInstall(new File([JSON.stringify({ id: 'net-test', name: 'Net test', permissions: ['watch.sources', 'companion'], companion: { url }, code })], 'net-test.json', { type: 'application/json' })), [probe, `http://127.0.0.1:${port}`]).catch(() => {});
  await p.waitForTimeout(1500);
  const reach = await ev(() => extCall('net-test', 'watch.sources', [{}]).then(r => (r || []).map(s => s.name)).catch(e => ['error ' + e.message]));
  ok('an extension\'s own code reaches its companion', reach.includes('companion reached'), reach.join(', '));
  ok('…and nowhere else, whatever the site\'s policy would allow', reach.includes('elsewhere blocked'), reach.join(', '));
  const v = await ev(() => window.__csp);
  ok('nothing the app does is blocked by its own policy', !v.length, v.slice(0, 6).join(' | '));
  const h = await (await fetch(base + '/')).headers;
  ok('the page refuses to be framed', /frame-ancestors 'none'/.test(h.get('content-security-policy') || '') && h.get('x-frame-options') === 'DENY');
  ok('scripts only from the site itself', /script-src 'self'(;|$)/.test(h.get('content-security-policy') || ''));
  ok('HSTS, nosniff, COOP', !!h.get('strict-transport-security') && h.get('x-content-type-options') === 'nosniff' && h.get('cross-origin-opener-policy') === 'same-origin');
  // an injected inline script is refused
  const inj = await ev(() => { window.__pwned = 0; const s = document.createElement('script'); s.textContent = 'window.__pwned = 1'; document.body.append(s); return new Promise(r => setTimeout(() => r(window.__pwned), 100)); });
  ok('an injected inline script doesn\'t run', inj === 0);
  ok('no page errors', !errs.length, errs.join(' | '));
  await b.close(); srv.close(); comp.close(); })();
