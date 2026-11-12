// tools/guard.ts
// ─────────────────────────────────────────────────────────────────
//  The identity guard: fails if any of my private words (my name and anything else that leads to me) appear in what
//  this repository holds or would hold: every file that's tracked or about to be added, every version of every file in
//  the history, the files inside any zip, picture metadata, and every commit's author, committer and message.
//
//  The words never live in the repository. They come from the PRIVATE_WORDS secret in CI, or from
//  ~/.config/sayel/private-words on my own machine: one word or phrase per line, # for comments.
//    node tools/guard.ts             check (prints "guard: clean" or where each hit is, never the word itself)
// ─────────────────────────────────────────────────────────────────
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";

/**
 * Lower case, accents and look-alike characters folded, and everything that isn't a letter or a digit (spaces,
 * punctuation, the dot in an address, the @ in an email) made one space: words and phrases are compared this way.
 */
export const fold = (text: string): string =>
    text
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ");

/** The words to look for, from the secret or my own file. */
export function readWords(env: NodeJS.ProcessEnv = process.env, home: string = os.homedir()): string[] {
    const file = path.join(home, ".config/sayel/private-words");
    const source = env.PRIVATE_WORDS || (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "");
    return source
        .split(/\r?\n|,/)
        .map(line => fold(line.replace(/#.*/, "")).trim())
        .filter(word => word.length >= 3);
}

/**
 * Every way a word could be hiding in some bytes: as UTF-8 text, the same with markup taken out (so <b>First</b> Last
 * can't split a name), as Latin-1 (old EXIF and PNG text chunks) and as UTF-16 (Windows tools, some picture metadata).
 */
export function readings(bytes: Buffer): string[] {
    const utf8 = bytes.toString("utf8");
    return [
        utf8,
        utf8.replace(/<[^>]*>/g, ""),
        bytes.toString("latin1"),
        bytes.length > 1 ? bytes.toString("utf16le") : "",
    ].map(fold);
}

/** Which of the words appear in folded text, as whole words or phrases. */
export const hitsIn = (folded: string, words: readonly string[]): string[] =>
    words.filter(word => ` ${folded} `.includes(` ${word} `));

/** Whether some bytes (and, for a zip, every file inside it) hold a private word. */
export function holdsWord(bytes: Buffer, words: readonly string[]): boolean {
    if (readings(bytes).some(text => hitsIn(text, words).length)) return true;
    if (bytes[0] === 0x50 && bytes[1] === 0x4b)
        try {
            return Object.values(unzipSync(new Uint8Array(bytes))).some(entry => holdsWord(Buffer.from(entry), words));
        } catch {
            /* not a zip after all: its bytes were checked above */
        }
    return false;
}

const git = (args: string[], input?: string): Buffer => execFileSync("git", args, { input, maxBuffer: 1 << 30 });
const nulList = (buffer: Buffer) => buffer.toString("utf8").split("\0").filter(Boolean);

/** Each object's contents, by id, read in one go (`git cat-file --batch`). */
function readObjects(ids: string[]): Map<string, Buffer> {
    const out = new Map<string, Buffer>();
    if (!ids.length) return out;
    const data = git(["cat-file", "--batch"], ids.join("\n") + "\n");
    let at = 0;
    while (at < data.length) {
        const end = data.indexOf(10, at),
            [id, type, size] = data.subarray(at, end).toString().split(" ");
        if (type === "missing") {
            at = end + 1;
            continue;
        }
        const n = Number(size);
        out.set(id, data.subarray(end + 1, end + 1 + n));
        at = end + 1 + n + 1; // the contents, then one newline
    }
    return out;
}

function hasHistory() {
    try {
        git(["rev-parse", "--verify", "-q", "HEAD"]);
        return true;
    } catch {
        return false; // a new repository, before its first commit
    }
}

// ── wiring ──
function main() {
    const words = readWords();
    if (!words.length) {
        console.error(
            "guard: skipped, no private words yet. To turn it on, set the PRIVATE_WORDS secret (CI) or ~/.config/sayel/private-words."
        );
        process.exit(0);
    }
    const found = new Set<string>();
    // what's here now: tracked files and the ones `git add -A` would add (so it works before the first commit too)
    for (const file of nulList(git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"]))) {
        const stat = fs.lstatSync(file, { throwIfNoEntry: false });
        if (stat && stat.isSymbolicLink()) {
            found.add(`${file}: a symbolic link (the guard doesn't follow links; commit the file itself)`);
            continue;
        }
        // deleted here but still staged: what's in the index is what would be committed
        const bytes = stat ? fs.readFileSync(file) : git(["show", ":" + file]);
        if (holdsWord(bytes, words)) found.add(`${file}: a private word`);
    }
    // every version of every file in the history, and every commit's people and message
    if (hasHistory()) {
        const named = new Map<string, string>();
        for (const line of git(["rev-list", "--objects", "--all"]).toString().split("\n")) {
            const space = line.indexOf(" ");
            if (space > 0) named.set(line.slice(0, space), line.slice(space + 1));
        }
        for (const [id, bytes] of readObjects([...named.keys()]))
            if (holdsWord(bytes, words)) found.add(`${named.get(id)} (in the history): a private word`);
        if (holdsWord(git(["log", "--all", "--format=%an%n%ae%n%cn%n%ce%n%B"]), words))
            found.add("a commit's author, committer or message: a private word");
    }
    if (found.size) {
        // the words themselves are never printed, so a CI log can't leak them
        for (const line of found) console.error("guard: " + line);
        process.exit(1);
    }
    console.log(`guard: clean (${words.length} words; every file, every version in the history, every commit)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main();
