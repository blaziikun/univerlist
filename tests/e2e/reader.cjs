// The reader: manga page by page right to left, two pages side by side, zoom, background and brightness, manhwa as one long scroll with
// width, gaps and auto-scroll, a progress bar you can click, books with your own font, size and page colour, and reaching the end logs it.
// Each kind of thing keeps its own choices.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const ENV = require('./env.cjs'); const { zipSync, strToU8 } = require('fflate');
const { chromium } = require('playwright'); const { setup } = require('./mocks.cjs');
const ok = (n, c, x = '') => console.log((c ? 'ok   ' : 'FAIL ') + n + (x ? ' | ' + x : ''));
// a tiny PNG of one colour, tall like a page
function png(w, h, rgb){ const crc = b => { let c, t = []; for (let n = 0; n < 256; n++){ c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const v of b) x = t[(x ^ v) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); }
(async () => {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ul-reader-'));
  const cbz = (name, n, tall) => { const f = {}; for (let i = 0; i < n; i++) f[`p${String(i + 1).padStart(3, '0')}.png`] = new Uint8Array(png(60, tall ? 400 : 90, [40 + i * 20, 90, 160])); const p = path.join(tmp, name); fs.writeFileSync(p, zipSync(f)); return p; };
  const manga = cbz('Test Manga Ch. 001.cbz', 7), strip = cbz('Test Manhwa Ch. 012.cbz', 6, true);
  const epub = path.join(tmp, 'Test Book.epub'); fs.writeFileSync(epub, zipSync({ mimetype: strToU8('application/epub+zip'), 'META-INF/container.xml': strToU8('<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/c.opf"/></rootfiles></container>'),
    'OEBPS/c.opf': strToU8('<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf"><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="b" href="b.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>'),
    'OEBPS/a.xhtml': strToU8('<html><head><title>A</title></head><body><p>Chapter one text.</p></body></html>'), 'OEBPS/b.xhtml': strToU8('<html><head><title>B</title></head><body><p>Chapter two text.</p></body></html>') }));
  const b = await chromium.launch(ENV.launch), c = await b.newContext({ viewport: { width: 1400, height: 900 } }); await setup(c);
  const p = await c.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); const ev = (f, a) => p.evaluate(f, a);
  await p.goto(ENV.APP); await p.waitForTimeout(800); await p.fill('#wl-name', 'T'); await p.click('[data-act="welcome-done"]');
  const open = async (title, medium, file) => { const id = await ev(([t, m]) => addItem({ medium: m, title: t, status: 'active', total: 50 }), [title, medium]); await ev(i => readFromItem(i), id); await p.waitForTimeout(300);
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), ev(() => document.querySelector('[data-act="read-files"]').click())]); await fc.setFiles(file); await p.waitForSelector('#reader'); await p.waitForTimeout(300); return id; };
  const R = () => ev(() => ({ mode: RD.mode, rtl: RD.rtl, idx: RD.idx, shown: [...document.querySelectorAll('#reader .rdimgs img')].map(i => i.alt), cls: document.querySelector('#reader').className, at: (document.querySelector('#reader .rdat') || {}).textContent }));
  const key = async k => { await p.keyboard.press(k); await p.waitForTimeout(150); };

  // ---- manga ----
  const mid = await open('Test Manga', 'manga', manga);
  let r = await R(); ok('manga: page by page, right to left, by itself', r.mode === 'paged' && r.rtl === true && r.shown.join() === 'Page 1', JSON.stringify(r));
  await key('ArrowLeft'); r = await R(); ok('← is the next page when reading right to left', r.idx === 1, JSON.stringify(r));
  await p.click('#reader [data-act="rd-opts"]'); ok('⚙ opens the reader settings', await ev(() => !!document.querySelector('#reader .rd-opts')));
  await p.click('#reader [data-act="rd-set"][data-k="spread"][data-v="double"]'); r = await R();
  ok('two pages side by side (the cover on its own)', r.shown.length === 2 && r.at.startsWith('Pages 2–3'), JSON.stringify(r));
  ok('…right to left: page 3 on the left, page 2 on the right', r.shown.join() === 'Page 3,Page 2', r.shown.join());
  await key('ArrowLeft'); r = await R(); ok('the next spread', r.at.startsWith('Pages 4–5'), r.at);
  await key('d'); r = await R(); ok('D goes back to one page', r.shown.length === 1, JSON.stringify(r));
  await key('+'); await key('+'); ok('+ zooms in', await ev(() => RS().zoom === 120 && getComputedStyle(document.querySelector('#reader .rdpage')).getPropertyValue('--rdz').trim() === '1.2'));
  await p.click('#reader [data-act="rd-set"][data-k="bg"][data-v="white"]'); ok('background: white', await ev(() => getComputedStyle(document.querySelector('#reader')).backgroundColor === 'rgb(246, 246, 244)'), await ev(() => getComputedStyle(document.querySelector('#reader')).backgroundColor));
  await ev(() => { const r = document.querySelector('#reader [data-ro="bright"]'); r.value = 70; r.dispatchEvent(new Event('input', { bubbles: true })); }); await p.waitForTimeout(300);
  ok('brightness', await ev(() => /brightness\(0\.7\)/.test(getComputedStyle(document.querySelector('#reader .rdimgs img')).filter)), await ev(() => getComputedStyle(document.querySelector('#reader .rdimgs img')).filter));
  await ev(() => document.querySelector('#reader .rdbar').dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: Math.round(innerWidth * .2), clientY: innerHeight - 2 }))); r = await R();
  ok('clicking the progress bar jumps (from the right, reading right to left)', r.idx === 5, JSON.stringify(r));
  await key('End'); await p.waitForTimeout(300);
  ok('reaching the last page logs the chapter, with Undo', await ev(i => items.get(i).prog === 1 && /Logged chapter 1/.test((document.querySelector('.toast') || {}).textContent || ''), mid), await ev(i => items.get(i).prog, mid));
  await key('Escape'); ok('Escape closes the settings first', await ev(() => !!document.querySelector('#reader') && !document.querySelector('#reader .rd-opts')));
  await key('Escape'); ok('…then the reader', await ev(() => !document.querySelector('#reader')));

  // ---- manhwa: its own choices ----
  await open('Test Manhwa', 'manhwa', strip); r = await R();
  ok('manhwa: one long scroll by itself', r.mode === 'scroll' && /rd-scroll/.test(r.cls), JSON.stringify(r));
  await p.waitForTimeout(800); ok("opening a long strip doesn't jump to the end or log it", await ev(() => RD.idx === 0 && items.get([...items.keys()].find(k => items.get(k).title === 'Test Manhwa')).prog === 0), await ev(() => RD.idx));
  ok("…and the manga's zoom and background didn't follow it here", await ev(() => RS().zoom === 100 && RS().bg === 'black'));
  await p.click('#reader [data-act="rd-opts"]');
  await ev(() => { for (const [k, v] of [['width', 600], ['gap', 20]]){ const r = document.querySelector(`#reader [data-ro="${k}"]`); r.value = v; r.dispatchEvent(new Event('input', { bubbles: true })); } }); await p.waitForTimeout(400);
  ok('width and gap between pages', await ev(() => { const s = document.querySelector('#reader .rdscroll'); return Math.round(s.getBoundingClientRect().width) === 600 && getComputedStyle(s).rowGap === '20px'; }), await ev(() => [document.querySelector('#reader .rdscroll').getBoundingClientRect().width, getComputedStyle(document.querySelector('#reader .rdscroll')).rowGap].join()));
  await p.click('#reader [data-act="rd-opts"]');
  const y0 = await ev(() => document.querySelector('#reader .rdstage').scrollTop); await key('a'); await p.waitForTimeout(1200);
  ok('A auto-scrolls', await ev(y => document.querySelector('#reader .rdstage').scrollTop > y + 20, y0), await ev(() => document.querySelector('#reader .rdstage').scrollTop));
  await key('a'); const y1 = await ev(() => document.querySelector('#reader .rdstage').scrollTop); await p.waitForTimeout(500);
  ok('…and A stops it', await ev(y => Math.abs(document.querySelector('#reader .rdstage').scrollTop - y) < 2, y1));
  await key('Escape');
  ok('the manga still has its choices', await ev(() => { const s = meta.settings.reader; return s.manga && s.manga.zoom === 120 && s.manga.bg === 'white' && s.manhwa && s.manhwa.width === 600; }), await ev(() => JSON.stringify(meta.settings.reader)));

  // ---- a book ----
  await open('Test Book', 'book', epub);
  ok('a book opens as chapters', await ev(() => RD.kind === 'epub' && RD.chapters.length === 2));
  await p.click('#reader [data-act="rd-opts"]'); await p.click('#reader [data-act="rd-set"][data-k="theme"][data-v="sepia"]');
  await ev(() => { const r = document.querySelector('#reader [data-ro="size"]'); r.value = 24; r.dispatchEvent(new Event('input', { bubbles: true })); }); await p.waitForTimeout(400);
  await p.waitForFunction(() => { const f = document.querySelector('#reader .rdepub'); return f && f.contentDocument && f.contentDocument.body; });
  const bk = await ev(() => { const d = document.querySelector('#reader .rdepub').contentDocument, cs = d.defaultView.getComputedStyle(d.body); return { bg: cs.backgroundColor, size: cs.fontSize, text: d.body.textContent.trim() }; });
  ok('sepia page and bigger text', bk.bg === 'rgb(244, 234, 212)' && bk.size === '24px' && /Chapter one/.test(bk.text), JSON.stringify(bk));
  await p.click('#reader [data-act="rd-set"][data-k="font"][data-v="sans"]'); await p.waitForTimeout(200);
  ok('a different font', await ev(() => /system-ui/.test(document.querySelector('#reader .rdepub').contentDocument.defaultView.getComputedStyle(document.querySelector('#reader .rdepub').contentDocument.body).fontFamily)));
  ok('no page errors', !errs.length, errs.slice(0, 3).join(' / '));
  await b.close(); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(0);
})();
