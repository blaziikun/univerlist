import fs from "node:fs";
import type { BrowserContext, Route } from "playwright";
const cover = fs.readFileSync(import.meta.dirname + "/../fixtures/cover.jpg");
const H = { "access-control-allow-origin": "*" };
const J = (r: Route, body: unknown) =>
    r.fulfill({ status: 200, contentType: "application/json", headers: H, body: JSON.stringify(body) });
// an AniList entry: id, English and romaji titles, type, format, country, episodes or chapters, your status, your score, genres
type Row = [number, string, string, string, string, string, number, string, number, string[]];
const ANIME: Row[] = [
    [
        1,
        "Bungo Stray Dogs",
        "Bungou Stray Dogs",
        "ANIME",
        "TV",
        "JP",
        12,
        "COMPLETED",
        90,
        ["Action", "Mystery", "Supernatural"],
    ],
    [2, "Death Note", "Death Note", "ANIME", "TV", "JP", 37, "COMPLETED", 95, ["Mystery", "Psychological", "Thriller"]],
    [
        3,
        "Frieren: Beyond Journey's End",
        "Sousou no Frieren",
        "ANIME",
        "TV",
        "JP",
        28,
        "CURRENT",
        0,
        ["Adventure", "Drama", "Fantasy"],
    ],
    [4, "Horimiya", "Horimiya", "ANIME", "TV", "JP", 13, "COMPLETED", 85, ["Romance", "Slice of Life"]],
    [
        5,
        "Code Geass",
        "Code Geass: Hangyaku no Lelouch",
        "ANIME",
        "TV",
        "JP",
        25,
        "PLANNING",
        0,
        ["Action", "Drama", "Mecha"],
    ],
    [6, "Banana Fish", "Banana Fish", "ANIME", "TV", "JP", 24, "COMPLETED", 92, ["Action", "Drama", "Psychological"]],
];
const MANGA: Row[] = [
    [101, "Bungo Stray Dogs", "Bungou Stray Dogs", "MANGA", "MANGA", "JP", 110, "CURRENT", 88, ["Action", "Mystery"]],
    [102, "Solo Leveling", "Na Honjaman Level Up", "MANGA", "MANGA", "KR", 179, "COMPLETED", 80, ["Action", "Fantasy"]],
    [
        103,
        "Mushoku Tensei",
        "Mushoku Tensei",
        "MANGA",
        "NOVEL",
        "JP",
        0,
        "PLANNING",
        0,
        ["Adventure", "Fantasy", "Drama"],
    ],
    [104, "Horimiya", "Horimiya", "MANGA", "MANGA", "JP", 125, "COMPLETED", 90, ["Romance", "Slice of Life"]],
];
const media = ([id, en, ro, type, format, c, n, , , genres]: Row) => ({
    id,
    idMal: id + 1000,
    type,
    format,
    status: id === 3 ? "RELEASING" : "FINISHED",
    episodes: type === "ANIME" ? n : null,
    chapters: type === "MANGA" ? n || null : null,
    volumes: type === "MANGA" ? Math.ceil((n || 10) / 9) : null,
    duration: 24,
    averageScore: 80 + (id % 9),
    meanScore: 80,
    popularity: 1000 * id,
    genres,
    countryOfOrigin: c,
    isAdult: false,
    season: "FALL",
    seasonYear: 2015 + (id % 8),
    synonyms: [],
    title: { romaji: ro, english: en, native: "日本" + id },
    coverImage: {
        extraLarge: `https://s4.anilist.co/cover/${id}.jpg`,
        large: `https://s4.anilist.co/cover/${id}.jpg`,
        color: ["#e4a15d", "#3b5ba5", "#86c1d4", "#d6345b", "#5ba55b", "#a55bd6"][id % 6],
    },
    bannerImage: `https://s4.anilist.co/banner/${id}.jpg`,
    startDate: { year: 2010 + (id % 12), month: 4, day: 1 },
    nextAiringEpisode: id === 3 ? { episode: 12, airingAt: Math.floor(Date.now() / 1000) + 3 * 86400 } : null,
    siteUrl: "https://anilist.co/x/" + id,
    tags: [
        { name: "Detective", rank: 80, isMediaSpoiler: false },
        { name: "Found Family", rank: 70, isMediaSpoiler: false },
    ],
    studios: { nodes: type === "ANIME" ? [{ name: "Bones" }] : [] },
});
const all = [...ANIME, ...MANGA];
const byId = (id: number) => all.find(x => x[0] === id);
const entry = (x: Row) => ({
    status: x[7],
    score: x[8],
    progress: x[7] === "CURRENT" ? 7 : x[7] === "COMPLETED" ? x[6] : 0,
    progressVolumes: 0,
    repeat: x[0] === 2 ? 1 : 0,
    notes: x[0] === 2 ? "L vs Light" : "",
    startedAt: { year: 2024, month: 3, day: 2 },
    completedAt: x[7] === "COMPLETED" ? { year: 2024, month: 5, day: 10 } : {},
    updatedAt: 1700000000 + x[0],
    createdAt: 1690000000 + x[0],
    media: media(x),
});
function anilist(body: { query: string; variables?: { id?: number; name?: string; type?: string; ids?: number[] } }) {
    const q = body.query,
        v = body.variables || {};
    if (q.includes("relations { edges { relationType node { id format type")) {
        const C = [21311, 21679, 103223, 141249, 163263],
            i = C.indexOf(v.id ?? 0),
            T = [
                "Bungo Stray Dogs",
                "Bungo Stray Dogs 2",
                "Bungo Stray Dogs 3",
                "Bungo Stray Dogs 4",
                "Bungo Stray Dogs 5",
            ],
            Y = [2016, 2016, 2019, 2023, 2023],
            S = ["SPRING", "FALL", "SPRING", "WINTER", "SUMMER"];
        if (i < 0) return { Media: null };
        const edges = [];
        if (i > 0) edges.push({ relationType: "PREQUEL", node: { id: C[i - 1], format: "TV", type: "ANIME" } });
        if (i < C.length - 1)
            edges.push({ relationType: "SEQUEL", node: { id: C[i + 1], format: "TV", type: "ANIME" } });
        return {
            Media: {
                id: v.id,
                format: "TV",
                episodes: 12,
                seasonYear: Y[i],
                season: S[i],
                title: { romaji: T[i], english: T[i] },
                relations: { edges },
            },
        };
    }
    if (q.includes("User(name") && !q.includes("favourites {"))
        return {
            User: {
                id: 9,
                name: v.name,
                about: "Hi",
                siteUrl: "https://anilist.co/user/" + v.name,
                avatar: { large: "https://s4.anilist.co/avatar.jpg" },
                bannerImage: "https://s4.anilist.co/ubanner.jpg",
                statistics: {
                    anime: { count: 6, meanScore: 88, minutesWatched: 4000, episodesWatched: 150, genres: [] },
                    manga: { count: 4, meanScore: 86, chaptersRead: 400, volumesRead: 20, genres: [] },
                },
            },
        };
    if (q.includes("MediaListCollection")) {
        const L = v.type === "ANIME" ? ANIME : MANGA;
        return {
            MediaListCollection: {
                hasNextChunk: false,
                lists: [
                    { name: "All", isCustomList: false, entries: L.map(entry) },
                    { name: "Mind games", isCustomList: true, entries: [entry(L[1])] },
                ],
            },
        };
    }
    if (q.includes("favourites {")) {
        const kind = ["anime", "manga", "characters", "staff", "studios"].find(k => q.includes(k + "(page"));
        const nodes =
            kind === "anime"
                ? [
                      media(ANIME[0]),
                      media(ANIME[1]),
                      media([
                          7,
                          "Little Busters! Refrain",
                          "Little Busters! Refrain",
                          "ANIME",
                          "TV",
                          "JP",
                          13,
                          "",
                          0,
                          ["Drama"],
                      ]),
                  ]
                : kind === "manga"
                  ? [media(MANGA[0])]
                  : kind === "characters"
                    ? [
                          {
                              id: 501,
                              name: { full: "Ranpo Edogawa", native: "江戸川乱歩" },
                              image: { large: "https://s4.anilist.co/char/501.jpg" },
                              gender: "Male",
                              age: "26",
                              description: "A detective. ~!Spoiler here!~ Genius.",
                              media: {
                                  nodes: [
                                      {
                                          id: 1,
                                          type: "ANIME",
                                          format: "TV",
                                          countryOfOrigin: "JP",
                                          title: { english: "Bungo Stray Dogs", romaji: "Bungou" },
                                      },
                                  ],
                              },
                          },
                          {
                              id: 502,
                              name: { full: "L Lawliet", native: "L" },
                              image: { large: "https://s4.anilist.co/char/502.jpg" },
                              gender: "Male",
                              age: "25",
                              description: "Detective",
                              media: {
                                  nodes: [
                                      {
                                          id: 2,
                                          type: "ANIME",
                                          format: "TV",
                                          countryOfOrigin: "JP",
                                          title: { english: "Death Note", romaji: "Death Note" },
                                      },
                                  ],
                              },
                          },
                      ]
                    : kind === "staff"
                      ? [
                            {
                                id: 801,
                                name: { full: "Kafka Asagiri", native: "" },
                                image: { large: "" },
                                primaryOccupations: ["Mangaka"],
                            },
                        ]
                      : [{ id: 901, name: "Bones" }];
        return { User: { favourites: { [String(kind)]: { pageInfo: { hasNextPage: false }, nodes } } } };
    }
    if (q.includes("id_in") && q.includes("relations"))
        return {
            Page: {
                media: (v.ids || []).map(id => {
                    const x: Row = byId(id) || [id, "Thing " + id, "Thing", "ANIME", "TV", "JP", 12, "", 0, ["Drama"]];
                    const m = {
                        ...media(x),
                        description: "A <b>story</b> about things.",
                        staff: { edges: [{ role: "Original Story", node: { name: { full: "Kafka Asagiri" } } }] },
                    };
                    const rel: [number, string][] =
                        id === 1
                            ? [
                                  [101, "SOURCE"],
                                  [301, "SEQUEL"],
                              ]
                            : id === 101
                              ? [[1, "ADAPTATION"]]
                              : id === 4
                                ? [[104, "SOURCE"]]
                                : id === 104
                                  ? [[4, "ADAPTATION"]]
                                  : id === 2
                                    ? [[302, "SOURCE"]]
                                    : [];
                    return {
                        ...m,
                        relations: {
                            edges: rel.map(([rid, t]) => {
                                const y = byId(rid);
                                return {
                                    relationType: t,
                                    node: {
                                        id: rid,
                                        idMal: rid,
                                        type: y ? y[3] : rid === 302 ? "MANGA" : "ANIME",
                                        format: y ? y[4] : "TV",
                                        status: "FINISHED",
                                        episodes: 12,
                                        chapters: 100,
                                        countryOfOrigin: "JP",
                                        title: {
                                            english: y
                                                ? y[1]
                                                : rid === 301
                                                  ? "Bungo Stray Dogs 2"
                                                  : "Death Note (manga)",
                                            romaji: "x",
                                            native: "x",
                                        },
                                        coverImage: { large: "https://s4.anilist.co/cover/" + rid + ".jpg" },
                                        startDate: { year: 2016 },
                                    },
                                };
                            }),
                        },
                    };
                }),
            },
        };
    if (q.includes("id_in"))
        return {
            Page: {
                media: (v.ids || []).map(id => ({
                    id,
                    status: "RELEASING",
                    episodes: 28,
                    chapters: null,
                    nextAiringEpisode: { episode: 12, airingAt: Math.floor(Date.now() / 1000) + 2 * 86400 },
                })),
            },
        };
    if (q.includes("recommendations"))
        return {
            Media: {
                recommendations: {
                    nodes: [
                        {
                            rating: 120,
                            mediaRecommendation: media([
                                201,
                                "Moriarty the Patriot",
                                "Yuukoku no Moriarty",
                                "ANIME",
                                "TV",
                                "JP",
                                24,
                                "",
                                0,
                                ["Mystery", "Psychological"],
                            ]),
                        },
                        {
                            rating: 60,
                            mediaRecommendation: media([
                                202,
                                "Monster",
                                "Monster",
                                "ANIME",
                                "TV",
                                "JP",
                                74,
                                "",
                                0,
                                ["Mystery", "Thriller"],
                            ]),
                        },
                    ],
                },
            },
        };
    if (q.includes("characters(sort"))
        return {
            Media: {
                characters: {
                    edges: [
                        {
                            role: "MAIN",
                            node: {
                                id: 501,
                                name: { full: "Ranpo Edogawa", native: "" },
                                image: { large: "https://s4.anilist.co/char/501.jpg" },
                                favourites: 9000,
                            },
                            voiceActors: [{ name: { full: "Kamiya" } }],
                        },
                        {
                            role: "MAIN",
                            node: {
                                id: 503,
                                name: { full: "Osamu Dazai", native: "" },
                                image: { large: "https://s4.anilist.co/char/503.jpg" },
                                favourites: 20000,
                            },
                            voiceActors: [],
                        },
                    ],
                },
            },
        };
    if (q.includes("characters(search"))
        return {
            Page: {
                characters: [
                    {
                        id: 504,
                        name: { full: "Lelouch Lamperouge", native: "" },
                        image: { large: "https://s4.anilist.co/char/504.jpg" },
                        gender: "Male",
                        age: "17",
                        description: "Prince",
                        media: {
                            nodes: [
                                {
                                    id: 5,
                                    type: "ANIME",
                                    format: "TV",
                                    countryOfOrigin: "JP",
                                    title: { english: "Code Geass", romaji: "x" },
                                },
                            ],
                        },
                    },
                ],
            },
        };
    if (q.includes("media(search"))
        return {
            Page: {
                media: [
                    media([
                        3,
                        "Frieren: Beyond Journey's End",
                        "Sousou no Frieren",
                        "ANIME",
                        "TV",
                        "JP",
                        28,
                        "",
                        0,
                        ["Fantasy"],
                    ]),
                    media([401, "Vagabond", "Vagabond", "MANGA", "MANGA", "JP", 327, "", 0, ["Action", "Drama"]]),
                ],
            },
        };
    return {};
}
async function setup(ctx: BrowserContext) {
    await ctx.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
    await ctx.route(/graphql\.anilist\.co/, r => {
        if (r.request().method() === "OPTIONS")
            return r.fulfill({
                status: 204,
                headers: { ...H, "access-control-allow-headers": "*", "access-control-allow-methods": "POST" },
            });
        J(r, { data: anilist(JSON.parse(r.request().postData() || "{}")) });
    });
    await ctx.route(
        /(s4\.anilist\.co|covers\.openlibrary\.org|image\.tmdb\.org|static\.tvmaze|media\.rawg|upload\.wikimedia)/,
        r => r.fulfill({ status: 200, contentType: "image/jpeg", body: cover, headers: H })
    );
    await ctx.route(/api\.jikan\.moe/, r => {
        const u = r.request().url();
        if (u.includes("/v4/anime?"))
            return J(r, {
                data: [
                    {
                        mal_id: 597,
                        title: "Pokemon Movie 05: Mizu no Miyako no Mamorigami Latias to Latios",
                        title_english: "Pokémon Heroes",
                        type: "Movie",
                        year: 2002,
                        images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/heroes.jpg" } },
                        synopsis: "Ash in Alto Mare.",
                        genres: [{ name: "Adventure" }],
                        duration: "1 hr 20 min",
                    },
                ],
            });
        if (u.includes("/pictures"))
            return J(r, { data: [{ jpg: { large_image_url: "https://s4.anilist.co/mal1.jpg" } }] });
        J(r, { data: { score: 8.62, rank: 50, members: 100000 } });
    });
    await ctx.route(/openlibrary\.org\/search\.json/, r => {
        const u = new URL(r.request().url());
        const q = (u.searchParams.get("q") || "Book").split(" ").slice(0, 4).join(" ");
        J(r, {
            docs: [
                {
                    key: "/works/OL" + q.length + "W",
                    title: q,
                    author_name: ["Someone"],
                    cover_i: 1000 + q.length,
                    edition_count: 40,
                    first_publish_year: 2001,
                    number_of_pages_median: 320,
                    subject: ["Fantasy", "Magic"],
                    ratings_average: 4.1,
                },
            ],
        });
    });
    await ctx.route(/openlibrary\.org\/works\//, r =>
        J(
            r,
            r.request().url().includes("ratings")
                ? { summary: { average: 4.12, count: 300 } }
                : r.request().url().includes("editions")
                  ? { entries: [{ covers: [5001] }] }
                  : { description: "A desc.", covers: [7001] }
        )
    );
    await ctx.route(/googleapis\.com/, r => J(r, { items: [] }));
    // music: MusicBrainz (search, an album, its first edition's tracks) and the Cover Art Archive
    await ctx.route(/musicbrainz\.org\/ws\/2\//, r => {
        const u = decodeURIComponent(r.request().url());
        const OK = {
            id: "mb-okc",
            title: "OK Computer",
            "primary-type": "Album",
            "first-release-date": "1997-05-21",
            "artist-credit": [{ name: "Radiohead" }],
            tags: [{ name: "alternative rock", count: 9 }],
        };
        if (u.includes("/release-group/?query="))
            return J(r, {
                "release-groups": [
                    OK,
                    {
                        id: "mb-live",
                        title: "I Might Be Wrong",
                        "primary-type": "Album",
                        "secondary-types": ["Live"],
                        "first-release-date": "2001-11-12",
                        "artist-credit": [{ name: "Radiohead" }],
                    },
                ],
            });
        if (u.includes("/release-group/"))
            return J(r, {
                ...OK,
                genres: [{ name: "rock", count: 3 }],
                releases: [{ id: "rel-1", status: "Official", date: "1997-05-21" }],
            });
        J(r, { id: "rel-1", media: [{ tracks: Array.from({ length: 12 }, () => ({ length: 270000 })) }] });
    });
    await ctx.route(/coverartarchive\.org/, r =>
        r.fulfill({ status: 200, contentType: "image/jpeg", body: cover, headers: H })
    );
    await ctx.route(/api\.tvmaze\.com/, r => {
        const u = r.request().url();
        const show = {
            id: 77,
            name: "White Collar",
            type: "Scripted",
            language: "English",
            genres: ["Crime", "Drama"],
            status: "Ended",
            runtime: 43,
            averageRuntime: 43,
            premiered: "2009-10-23",
            network: { name: "USA Network", country: { code: "US" } },
            rating: { average: 8.1 },
            image: { medium: "https://static.tvmaze.com/1.jpg", original: "https://static.tvmaze.com/1.jpg" },
            summary: "<p>A con man.</p>",
            externals: { imdb: "tt1358522" },
            _embedded: {
                episodes: new Array(81).fill(0).map((_, i) => ({ id: i })),
                cast: [
                    {
                        person: { name: "Matt Bomer", image: null },
                        character: { name: "Neal Caffrey", image: { medium: "https://static.tvmaze.com/neal.jpg" } },
                    },
                ],
            },
        };
        if (u.includes("/episodes"))
            return J(
                r,
                Array.from({ length: 28 }, (_, i) => ({
                    id: 1000 + i,
                    season: i < 14 ? 1 : 2,
                    number: (i % 14) + 1,
                    name: "Ep " + (i + 1),
                    airdate: "2009-10-23",
                    runtime: 43,
                    image: i % 3 ? null : { medium: "https://static.tvmaze.com/e.jpg" },
                    summary: "<p>Things happen.</p>",
                }))
            );
        if (u.includes("/search/shows")) return J(r, [{ score: 1, show }]);
        if (u.includes("/images"))
            return J(r, [{ type: "poster", resolutions: { original: { url: "https://static.tvmaze.com/p.jpg" } } }]);
        J(r, show);
    });
    await ctx.route(/wikidata\.org\/w\/api\.php/, r =>
        /witcher/i.test(decodeURIComponent(r.request().url()))
            ? J(r, { search: [{ id: "Q5", label: "The Witcher 3: Wild Hunt", description: "2015 video game" }] })
            : J(r, {
                  search: [
                      { id: "Q1", label: "The Prestige", description: "2006 film directed by Christopher Nolan" },
                      { id: "Q2", label: "The Prestige", description: "novel by Christopher Priest" },
                  ],
              })
    );
    await ctx.route(/query\.wikidata\.org/, r => {
        const q = decodeURIComponent(r.request().url());
        {
            const q2 = q.replace(/\+/g, " ");
            const B = (o: Record<string, string>) =>
                    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }])),
                E = (x: string) => "http://www.wikidata.org/entity/" + x,
                game = /Q5\b/.test(q);
            if (q2.includes("VALUES ?x"))
                return J(r, {
                    results: {
                        bindings: [
                            B({
                                x: E("P1"),
                                sl: "90",
                                img: "http://commons.wikimedia.org/wiki/Special:FilePath/HJ.jpg",
                            }),
                            B({
                                x: E("G1"),
                                sl: "60",
                                va: E("V1"),
                                vaLabel: "Doug Cockle",
                                art: "https://en.wikipedia.org/wiki/Geralt_of_Rivia",
                            }),
                            B({ x: E("G2"), sl: "40", va: E("V2"), vaLabel: "Jo Wyatt" }),
                            B({ x: E("G3"), sl: "45" }),
                        ],
                    },
                });
            if (q.includes("P161"))
                return J(r, {
                    results: {
                        bindings: game
                            ? [
                                  B({
                                      kind: "voice",
                                      c: E("G1"),
                                      cLabel: "Geralt of Rivia",
                                      p: E("V1"),
                                      pLabel: "Doug Cockle",
                                  }),
                              ]
                            : [
                                  B({
                                      kind: "cast",
                                      c: E("C1"),
                                      cLabel: "Robert Angier",
                                      p: E("P1"),
                                      pLabel: "Hugh Jackman",
                                      ord: "1",
                                  }),
                                  B({
                                      kind: "cast",
                                      c: E("C2"),
                                      cLabel: "Alfred Borden",
                                      p: E("P2"),
                                      pLabel: "Christian Bale",
                                      ord: "2",
                                  }),
                              ],
                    },
                });
            if (q2.includes("SELECT DISTINCT ?c ?cLabel") && q.includes("P179"))
                return J(r, { results: { bindings: game ? [B({ c: E("G3"), cLabel: "Yennefer" })] : [] } });
            if (q2.includes("SELECT DISTINCT ?c ?cLabel"))
                return J(r, {
                    results: {
                        bindings: game
                            ? [B({ c: E("G1"), cLabel: "Geralt of Rivia" }), B({ c: E("G2"), cLabel: "Ciri" })]
                            : [
                                  B({ c: E("C1"), cLabel: "Robert Angier" }),
                                  B({ c: E("C9"), cLabel: "Olivia Wenscombe" }),
                              ],
                    },
                });
        }
        if (q.includes("P144"))
            return J(r, {
                results: {
                    bindings: [
                        {
                            src: { value: "http://www.wikidata.org/entity/Q2" },
                            x: { value: "http://www.wikidata.org/entity/Q9" },
                            xLabel: { value: "Six of Crows (TV adaptation)" },
                            xDesc: { value: "2023 television series" },
                            dir: { value: "from" },
                        },
                    ],
                },
            });
        if (q.includes("P166")) return J(r, { results: { bindings: [] } });
        J(r, {
            results: {
                bindings: [
                    {
                        item: { value: "http://www.wikidata.org/entity/Q1" },
                        itemLabel: { value: "The Prestige" },
                        date: { value: "2006-10-20T00:00:00Z" },
                        dur: { value: "130" },
                        imdb: { value: "tt0482571" },
                        creatorLabel: { value: "Christopher Nolan" },
                        genreLabel: { value: "thriller film" },
                        article: { value: "https://en.wikipedia.org/wiki/The_Prestige_(film)" },
                        score: { value: "76%" },
                        byLabel: { value: "Rotten Tomatoes" },
                    },
                ],
            },
        });
    });
    await ctx.route(/^https:\/\/en\.wikipedia\.org/, r =>
        J(r, {
            query: {
                pages: {
                    1: {
                        title: "The Prestige (film)",
                        thumbnail: { source: "https://upload.wikimedia.org/p.jpg" },
                        extract: "A film about magicians.",
                    },
                },
            },
        })
    );
    await ctx.route(/api\.themoviedb\.org/, r => {
        const u = r.request().url();
        if (u.includes("configuration")) return J(r, { images: {} });
        const res = {
            id: 1124,
            title: "The Prestige",
            original_title: "The Prestige",
            release_date: "2006-10-17",
            poster_path: "/p.jpg",
            backdrop_path: "/b.jpg",
            overview: "Magicians.",
            vote_average: 8.2,
            genre_ids: [18, 9648],
            original_language: "en",
        };
        if (u.includes("/search/")) return J(r, { results: [res] });
        J(r, {
            ...res,
            runtime: 130,
            genres: [{ id: 18, name: "Drama" }],
            imdb_id: "tt0482571",
            external_ids: { imdb_id: "tt0482571" },
            credits: {
                crew: [{ job: "Director", name: "Christopher Nolan" }],
                cast: [{ character: "Angier", name: "Hugh Jackman", profile_path: "/h.jpg" }],
            },
            recommendations: { results: [{ ...res, id: 27205, title: "Inception", release_date: "2010-07-16" }] },
            "watch/providers": { results: { GB: { flatrate: [{ provider_name: "Netflix" }] } } },
        });
    });
    await ctx.route(/omdbapi\.com/, r =>
        J(r, {
            Response: "True",
            imdbRating: "8.5",
            Metascore: "66",
            imdbVotes: "1,400,000",
            Ratings: [
                { Source: "Internet Movie Database", Value: "8.5/10" },
                { Source: "Rotten Tomatoes", Value: "76%" },
                { Source: "Metacritic", Value: "66/100" },
            ],
        })
    );
    await ctx.route(/api\.rawg\.io/, r => {
        const g = {
            id: 3328,
            slug: "the-witcher-3",
            name: "The Witcher 3: Wild Hunt",
            released: "2015-05-18",
            background_image: "https://media.rawg.io/w3.jpg",
            rating: 4.66,
            metacritic: 92,
            playtime: 46,
            genres: [{ name: "RPG" }],
            platforms: [{ platform: { name: "PC" } }, { platform: { name: "PlayStation 5" } }],
            added: 20000,
        };
        if (/games\/\d+\/screenshots/.test(r.request().url()))
            return J(r, { results: [{ image: "https://media.rawg.io/s1.jpg" }] });
        if (/games\/\d+/.test(r.request().url()))
            return J(r, {
                ...g,
                description_raw: "Geralt.",
                developers: [{ name: "CD Projekt Red" }],
                tags: [{ language: "eng", name: "Story Rich" }],
            });
        J(r, { results: [g] });
    });
    await ctx.route(/reddit\.com|algolia|stackexchange/, r => J(r, { data: { children: [] }, hits: [], items: [] }));
}
export { setup };
