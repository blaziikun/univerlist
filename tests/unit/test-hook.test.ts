// @vitest-environment happy-dom
// The browser tests and extensions' own test suites reach into the page through window.__ulTest
// (core/test-hook.ts): every name on it is something its module still exports, and the two the tests replace take a
// stand-in. Builds people get never have it (tools/no-test-hook.ts, checked here on folders made for the test).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { installTestHook } from "../../src/features/core/test-hook";
import { extCall } from "../../src/features/extensions/extensions";
import { renderMain } from "../../src/features/core/shell";
import { MARKS, marksIn } from "../../tools/no-test-hook.ts";

installTestHook();
const hook = window.__ulTest;

describe("the test hook", () => {
    it("is on the page, every name on it something its module exports", () => {
        const names = Object.keys(hook);
        expect(names.length).toBeGreaterThan(150);
        expect(names.filter(n => Reflect.get(hook, n) === undefined)).toEqual([]);
    });

    it("reads each name live from its module", () => {
        expect(hook.extCall).toBe(extCall);
        expect(hook.booted).toBe(false); // the app hasn't started here
        expect(typeof hook.syncNow).toBe("function");
    });

    it("lets a test put a stand-in in extCall's and renderMain's place, and nothing that isn't a function", async () => {
        const realCall = hook.extCall,
            realMain = hook.renderMain;
        hook.extCall = async (id, job) => `${id}:${job}`;
        expect(await extCall("x", "watch.sources", [], 10)).toBe("x:watch.sources");
        let drawn = 0;
        hook.renderMain = () => {
            drawn++;
        };
        renderMain();
        expect(drawn).toBe(1);
        Reflect.set(hook, "extCall", "not a function"); // as a suite in plain JavaScript could
        expect(await extCall("x", "y", [], 10)).toBe("x:y");
        hook.extCall = realCall;
        hook.renderMain = realMain;
        expect(await extCall("nobody", "watch.sources", [], 10)).toBeNull();
    });

    it("can't be found in a build without it, and is found in one with it", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ul-hook-"));
        fs.mkdirSync(path.join(dir, "assets"));
        fs.writeFileSync(path.join(dir, "index.html"), "<script src=assets/a.js></script>");
        fs.writeFileSync(path.join(dir, "assets/a.js"), "console.log('the app')");
        expect(marksIn(dir).size).toBe(0);
        fs.writeFileSync(path.join(dir, "assets/b.js"), `Object.defineProperty(window,"${MARKS[0]}",{value:{}})`);
        expect([...marksIn(dir)]).toEqual([["assets/b.js", [MARKS[0]]]]);
        fs.rmSync(dir, { recursive: true });
    });
});
