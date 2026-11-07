// Hostile zips and pictures: a zip bomb is refused before it fills memory, with a clear message; a "picture" is only
// ever what its bytes say it is; and an export too big for a plain zip says so instead of writing a broken file.
const ENV = require('./env.cjs');
const { chromium } = require('playwright'); const { setup } = require('./mocks.cjs');
const { zipSync } = require('fflate');
const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
(async () => {
  const b = await chromium.launch(ENV.launch), c = await b.newContext(); await setup(c);
  const p = await c.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); const ev = (f, a) => p.evaluate(f, a);
  await p.goto(ENV.APP); await p.waitForTimeout(800); await p.fill('#wl-name', 'T'); await p.click('[data-act="welcome-done"]');

  // 4 MB of zeros squeezes to a few KB: with the limit lowered to 1 MB it stands in for a real bomb
  const bomb = Buffer.from(zipSync({ 'library/anime.json': new Uint8Array(4 * 1048576) }, { level: 9 }));
  let st = await ev(async bytes => {
    ZIP_LIMITS.total = 1048576;
    const file = new File([new Uint8Array(bytes)], 'bomb.zip');
    let err = '';
    try { await readImportFile(file); } catch (e) { err = e.message; }
    await handleImportFile(file);
    await new Promise(r => setTimeout(r, 200));
    return { err, shown: document.querySelector('.modal') ? document.querySelector('.modal').innerText : '' };
  }, [...bomb]);
  ok('a zip that unpacks past the limit is refused while unpacking', st.err === 'too big', st.err);
  ok('…and the person is told why', /more than any export could/.test(st.shown), st.shown.slice(0, 120));
  ok(`the bomb was ${Math.round(bomb.length / 1024)} KB, so the limit stopped it, not its size`, bomb.length < 100 * 1024);

  st = await ev(() => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const page = new TextEncoder().encode('<html><script>alert(1)</script></html>');
    const svg = new TextEncoder().encode('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>');
    return { png: pictureType(png), page: pictureType(page), svg: pictureType(svg), pageData: bytesToData(page), pngData: bytesToData(png).slice(0, 22) };
  });
  ok('a picture\'s type comes from its bytes, and an SVG (which can carry a script) isn\'t one', st.png === 'png' && st.svg === null, JSON.stringify(st));
  ok('…and a web page named .jpg is no picture at all', st.page === null && st.pageData === '', JSON.stringify(st));
  st = await ev(async () => {
    const page = new TextEncoder().encode('<html><script>alert(1)</script></html>');
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    return { page: await restoreImages([['https://example.com/a.jpg', page, 'covers/a.jpg']]), png: await restoreImages([['https://example.com/b.png', png, 'covers/b.png']]) };
  });
  ok('restoring a backup\'s pictures skips the one that isn\'t a picture', st.page === 0 && st.png === 1, JSON.stringify(st));

  st = await ev(() => {
    try { zipFiles(Array.from({ length: 65536 }, (_, i) => ({ name: 'f' + i, data: '' }))); return ''; } catch (e) { return e.message; }
  });
  ok('an export past what a plain zip can hold stops with a reason', st === 'too big', st);

  ok('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
})().catch(e => { console.log('FAIL ' + e.message.split('\n')[0]); process.exit(1); });
