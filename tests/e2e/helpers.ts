// ============ what every browser test uses ============
import type { Server } from "node:http";
import type { Page } from "playwright";

/** one check: "ok   <name>" or "FAIL <name> | <what was seen>", the lines run.ts counts */
export const ok = (name: string, pass: unknown, seen: unknown = ""): void =>
    console.log((pass ? "ok   " : "FAIL ") + name + (seen ? " | " + String(seen) : ""));

/** page.evaluate for plain data: f runs in the page, given a (copied there). The result comes back typed as f returns
 *  it, and `a` keeps its exact shape (a tuple stays a tuple), so f's parameter is typed by what's passed */
export function evaluator(page: Page) {
    function ev<R>(f: () => R | Promise<R>): Promise<R>;
    function ev<R, const A>(f: (a: A) => R | Promise<R>, a: A): Promise<R>;
    function ev(f: (a: unknown) => unknown, a?: unknown): Promise<unknown> {
        return page.evaluate(f, a);
    }
    return ev;
}

/** start a local server on a free port: resolves with the port once it's listening */
export async function listen(srv: Server): Promise<number> {
    await new Promise<void>(r => srv.listen(0, "127.0.0.1", r));
    const at = srv.address();
    if (!at || typeof at === "string") throw new Error("the test's server isn't listening");
    return at.port;
}
