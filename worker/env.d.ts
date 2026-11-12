// worker/env.d.ts
// ─────────────────────────────────────────────────────────────────
//  What Cloudflare gives the Worker, as types
//
//  Only the few parts of the Workers runtime this Worker uses: its bindings and settings (Env, from wrangler.jsonc and
//  its secrets), D1, R2, rate limiting and the edge cache. The rest (Request, Response, fetch, crypto) is the web's own,
//  from the WebWorker library in worker/tsconfig.json.
// ─────────────────────────────────────────────────────────────────

declare global {
    /** a rate limit binding (wrangler.jsonc → ratelimits) */
    interface RateLimit {
        limit(options: { key: string }): Promise<{ success: boolean }>;
    }

    /** the site's own files (wrangler.jsonc → assets) */
    interface Fetcher {
        fetch(req: Request): Promise<Response>;
    }

    interface D1PreparedStatement {
        bind(...values: unknown[]): D1PreparedStatement;
        /** the first row, or null. T is the row the query selects: D1 hands back whatever the table holds */
        first<T = Record<string, unknown>>(): Promise<T | null>;
        all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
        run(): Promise<{ meta?: { changes: number } }>;
    }
    interface D1Database {
        prepare(sql: string): D1PreparedStatement;
        /** the statements in one transaction: all of them or none */
        batch(statements: D1PreparedStatement[]): Promise<unknown>;
    }

    interface R2Object {
        size: number;
        uploaded: Date;
    }
    interface R2Bucket {
        get(key: string): Promise<{ body: ReadableStream } | null>;
        head(key: string): Promise<R2Object | null>;
        put(key: string, value: ArrayBuffer | Uint8Array): Promise<unknown>;
        delete(key: string): Promise<void>;
    }

    /** Cloudflare's cache at the edge: caches.default */
    interface CacheStorage {
        readonly default: Cache;
    }

    /** the catalogue proxy's secrets and limits (worker/proxy.ts): all optional, each source works once its key is set */
    interface ProxyEnv {
        TMDB_KEY?: string;
        CLIENT_ID?: string;
        CLIENT_SECRET?: string;
        SGDB_KEY?: string;
        TGDB_KEY?: string;
        CV_KEY?: string;
        HC_KEY?: string;
        SS_DEVID?: string;
        SS_DEVPASS?: string;
        SS_USER?: string;
        SS_PASS?: string;
        PASS?: string;
        SHARED_RL?: RateLimit;
        SHARED_ALL?: RateLimit;
    }

    /** everything the site's Worker is given (wrangler.jsonc and its secrets) */
    interface Env extends ProxyEnv {
        ASSETS: Fetcher;
        API_RL?: RateLimit;
        AUTH_RL?: RateLimit;
        ACCOUNTS?: D1Database;
        LIBRARIES?: R2Bucket;
        ORIGIN?: string;
        RP_ID?: string;
        MAX_USERS?: string;
    }
}
export {};
