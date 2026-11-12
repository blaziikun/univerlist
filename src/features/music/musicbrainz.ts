// src/features/music/musicbrainz.ts
// ─────────────────────────────────────────────────────────────────
//  Music: albums from MusicBrainz, covers from the Cover Art Archive
//
//  Both are free, need no key, and answer browsers directly (CORS), so nothing goes through our server.
//    search          the release groups ("albums": an album, EP, single, live album… across all its editions) for a
//    query
//    albumDetails    for one: how many tracks, how long, its genres, and the edition the numbers came from
//  MusicBrainz asks for at most one request a second from each user, so every call here waits its turn (queue below).
//  Results are in the shape every other source in the app gives (sources/sources.ts): title, creator, year, kind,
//  cover, genres, ext ids, so adding, cards and search treat albums like anything else.
// ─────────────────────────────────────────────────────────────────

const MB = "https://musicbrainz.org/ws/2";
const CAA = "https://coverartarchive.org/release-group";

/** a search result, as the rest of the app expects one */
type Album = {
    src: "mb";
    medium: "album";
    title: string;
    creator: string; // the artist (or artists, as credited)
    year?: number;
    kind: string; // Album, EP, Single, Live, Compilation, Soundtrack, Mixtape…
    cover: string;
    genres: string[];
    ext: { mbid: string };
};
type Credit = { name: string; joinphrase?: string };
type Tag = { name: string; count?: number };
type ReleaseGroup = {
    id: string;
    title: string;
    "primary-type"?: string;
    "secondary-types"?: string[];
    "first-release-date"?: string;
    "artist-credit"?: Credit[];
    tags?: Tag[];
    genres?: Tag[];
};

// ── one request a second, in order (and a request whose search was abandoned is skipped) ──
let last = 0,
    queue: Promise<unknown> = Promise.resolve();
const GAP = 1100;
function mb<T>(path: string, signal?: AbortSignal): Promise<T> {
    const run = async () => {
        const wait = last + GAP - Date.now();
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        signal?.throwIfAborted();
        last = Date.now();
        const r = await fetch(`${MB}${path}${path.includes("?") ? "&" : "?"}fmt=json`, {
            signal,
            headers: { Accept: "application/json" },
        });
        if (!r.ok) throw new Error(`MusicBrainz answered ${r.status}`);
        return (await r.json()) as T;
    };
    const p = queue.then(run, run);
    queue = p.catch(() => {});
    return p;
}

/** what kind of release it is, in the words the app uses: a live album says Live, not Album */
function kindOf(g: ReleaseGroup): string {
    const second = (g["secondary-types"] || []).find(t =>
        ["Live", "Compilation", "Soundtrack", "Mixtape/Street", "Remix"].includes(t)
    );
    if (second) return second === "Mixtape/Street" ? "Mixtape" : second;
    return g["primary-type"] || "Album";
}
const artistOf = (credits: Credit[] = []) =>
    credits
        .map(c => c.name + (c.joinphrase || ""))
        .join("")
        .trim();
const yearOf = (d?: string) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : undefined);
/** the few most-used genre words (MusicBrainz's genres when it has them, otherwise its most-used tags) */
const genresOf = (g: ReleaseGroup) =>
    [...(g.genres?.length ? g.genres : g.tags || [])]
        .sort((a, b) => (b.count || 0) - (a.count || 0))
        .slice(0, 5)
        .map(t => t.name.replace(/\b\w/g, c => c.toUpperCase()));

export function toAlbum(g: ReleaseGroup): Album {
    return {
        src: "mb",
        medium: "album",
        title: g.title,
        creator: artistOf(g["artist-credit"]),
        year: yearOf(g["first-release-date"]),
        kind: kindOf(g),
        cover: `${CAA}/${g.id}/front-500`,
        genres: genresOf(g),
        ext: { mbid: g.id },
    };
}

/** albums for a search: "OK Computer", or "Radiohead OK Computer" */
export async function searchAlbums(q: string, signal?: AbortSignal): Promise<Album[]> {
    const query = encodeURIComponent(q.trim());
    if (!query) return [];
    const d = await mb<{ "release-groups"?: ReleaseGroup[] }>(`/release-group/?query=${query}&limit=15`, signal);
    return (d["release-groups"] || []).map(toAlbum);
}

type Release = {
    id: string;
    status?: string;
    date?: string;
    media?: { "track-count"?: number; tracks?: { length?: number }[] }[];
};

/** one album's tracks and length, from its first official edition */
export async function albumDetails(
    mbid: string,
    signal?: AbortSignal
): Promise<Partial<Album> & { total?: number; runtime?: number; edition?: string }> {
    const g = await mb<ReleaseGroup & { releases?: Release[] }>(
        `/release-group/${mbid}?inc=releases+genres+tags+artist-credits`,
        signal
    );
    const out: Partial<Album> & { total?: number; runtime?: number; edition?: string } = toAlbum(g);
    const first = [...(g.releases || [])]
        .filter(r => !r.status || r.status === "Official")
        .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"))[0];
    if (!first) return out;
    const r = await mb<Release>(`/release/${first.id}?inc=recordings`, signal);
    const tracks = (r.media || []).flatMap(m => m.tracks || []);
    if (tracks.length) {
        out.total = tracks.length;
        const ms = tracks.reduce((a, t) => a + (t.length || 0), 0);
        // minutes per track, like minutes per episode for a show: how long you've listened is tracks played × this
        if (ms) out.runtime = Math.max(1, Math.round(ms / 60000 / tracks.length));
    }
    out.edition = first.id;
    return out;
}
