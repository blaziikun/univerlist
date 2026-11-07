// ============ where the browser tests find things ============
//   APP_URL     the build to test (default: the one-file build, dist-file/index.html)
//   UL_EXPORT   one of your own exports, to test with real data. Never commit it: point at it in backups/
//               e.g.  UL_EXPORT=../backups/profile-export_you_2026-01-01.zip pnpm test:e2e
//   CHROME      a Chromium to use instead of Playwright's own
const path = require("path"), fs = require("fs");
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "tests/out"); fs.mkdirSync(OUT, { recursive: true });
const EXPORT = process.env.UL_EXPORT ? path.resolve(process.env.UL_EXPORT) : "";
module.exports = {
  ROOT, OUT, EXPORT,
  APP: process.env.APP_URL || "file://" + path.join(ROOT, "dist-file/index.html"),
  FIX: path.join(ROOT, "tests/fixtures"),
  EXT: id => path.join(ROOT, "dist-file/extensions", id + ".zip"),
  launch: { ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}) },
  needExport(){ if (!EXPORT || !fs.existsSync(EXPORT)) { console.log("skip  needs UL_EXPORT (one of your exports)"); process.exit(0); } }
};
