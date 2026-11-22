// src/features/watch-read/player/lang.ts
// ─────────────────────────────────────────────────────────────────
//  Which language a subtitle track is in, however it's labelled
//
//  Tracks name their language every way there is: "en", "eng", "en-GB", "English", "English (SDH)", "ENG Forced". A
//  companion reading an MKV gives three-letter codes, a server two-letter ones or a name, a file whatever its maker
//  typed. Each language the player offers (stream.ts SUB_LANGS) is recognised in all of them, so yours is found and
//  switched on by itself, and a full track is picked over one that only carries signs or forced lines.
// ─────────────────────────────────────────────────────────────────

// each language's other names: its three-letter codes (both kinds) and its name in English and in itself
const NAMES: Record<string, string[]> = {
    en: ["eng", "english"],
    es: ["spa", "spanish", "español", "espanol", "castellano"],
    fr: ["fre", "fra", "french", "français", "francais"],
    de: ["ger", "deu", "german", "deutsch"],
    it: ["ita", "italian", "italiano"],
    pt: ["por", "portuguese", "português", "portugues"],
    ja: ["jpn", "japanese", "日本語"],
    ar: ["ara", "arabic", "العربية"],
    ru: ["rus", "russian", "русский"],
    zh: ["chi", "zho", "chinese", "中文"],
    ko: ["kor", "korean", "한국어"],
};

/** the two-letter code of a language however it's written ("eng", "en-GB", "English (SDH)" → "en"); "" when it
 *  isn't one the player knows */
export function langCode(x: string | undefined | null): string {
    const s = String(x || "")
        .trim()
        .toLowerCase();
    if (!s) return "";
    // a code, with or without its region: "en", "eng", "pt-BR", "zh_Hans"
    const head = s.split(/[-_]/)[0];
    if (NAMES[head]) return head;
    for (const [code, other] of Object.entries(NAMES)) if (other.includes(head)) return code;
    // a label: any of its words a language's name or three-letter code ("English (SDH)", "ENG Forced"); two-letter
    // codes only count as the whole label, since "it" and "de" are words too
    const words = s.split(/[^\p{L}]+/u).filter(Boolean);
    for (const [code, other] of Object.entries(NAMES)) if (words.some(w => other.includes(w))) return code;
    return "";
}

/** a track with only part of the lines: forced ones, or the signs and songs */
const partial = (t: { label?: string; forced?: boolean }) => !!t.forced || /\b(forced|signs?)\b/i.test(t.label || "");

/** the track to show for a language: a full one over a partial one, the first of its kind otherwise */
export function subFor<T extends { lang?: string; label?: string; forced?: boolean }>(
    tracks: T[],
    want: string
): T | undefined {
    const w = langCode(want);
    if (!w) return undefined;
    const mine = tracks.filter(t => langCode(t.lang) === w || langCode(t.label) === w);
    return mine.find(t => !partial(t)) || mine[0];
}
