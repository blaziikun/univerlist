// @vitest-environment happy-dom
// UniverList moved to univerlist.app (update/moved.ts): at the old address, an empty browser goes straight on to the
// same page there, one with a library stays and is shown how to take it across; at the new address nothing happens.
import { describe, expect, it, vi } from "vitest";
import { movedCheck } from "../../src/features/update/moved";

// cast: happy-dom's own handle on the page, which a test can point at another address
const at = (url: string) => (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(url);

describe("the old address", () => {
    it("sends an empty browser on to the same page at univerlist.app", () => {
        at("https://univerlist.sayel.dev/?q=1#watch/frieren/1/3");
        const go = vi.fn(),
            show = vi.fn();
        movedCheck(false, show, go);
        expect(go).toHaveBeenCalledWith("https://univerlist.app/?q=1#watch/frieren/1/3");
        expect(show).not.toHaveBeenCalled();
    });
    it("keeps a browser with a library, and shows how to take it across", () => {
        at("https://univerlist.sayel.dev/");
        const go = vi.fn(),
            show = vi.fn();
        movedCheck(true, show, go);
        expect(show).toHaveBeenCalledOnce();
        expect(go).not.toHaveBeenCalled();
    });
    it("does nothing anywhere else: the new address, your own copy, the one file", () => {
        for (const url of ["https://univerlist.app/", "https://my-copy.example/", "http://localhost:5173/"]) {
            at(url);
            const go = vi.fn(),
                show = vi.fn();
            movedCheck(false, show, go);
            movedCheck(true, show, go);
            expect(go).not.toHaveBeenCalled();
            expect(show).not.toHaveBeenCalled();
        }
    });
});
