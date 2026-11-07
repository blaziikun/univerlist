// tools/icons.mjs
// ─────────────────────────────────────────────────────────────────
//  Icons: public/icon.svg → the PNG sizes phones and app installs ask for
//
//  node tools/icons.mjs   (needs Playwright's Chromium: pnpm exec playwright install chromium)
// ─────────────────────────────────────────────────────────────────

import fs from "node:fs";
import { chromium } from "playwright";
const svg = fs.readFileSync("public/icon.svg", "utf8");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
for (const n of [192, 512]) {
    const p = await browser.newPage({ viewport: { width: n, height: n } });
    await p.setContent(
        `<style>html,body{margin:0;background:#0b0c12}svg{display:block;width:${n}px;height:${n}px}</style>${svg}`
    );
    await p.screenshot({ path: `public/icon-${n}.png` });
    await p.close();
}
await browser.close();
console.log("icons written");
