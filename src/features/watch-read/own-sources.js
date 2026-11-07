// src/features/watch-read/own-sources.js
// ─────────────────────────────────────────────────────────────────
//  Your own sources: the one rule for what Watch plays
//
//  Watch plays what's yours: files on this device, addresses on your own network (this computer, your home network, a
//  Tailscale address), servers you've added yourself (your media servers, an extension's companion), and YouTube.
//  Every address that could reach the player comes through isOwnSource(): a pasted link, a link pattern, a series' own
//  servers, what an extension offers, and finally the player itself. So the app has no way to play from somewhere that
//  isn't yours, and nothing in it searches for videos.
// ─────────────────────────────────────────────────────────────────

// what can only be on your own network. An address's host is one of three things, each checked only against its own
// list: a number like 192.168.1.20 (so a name such as 10.example.com never counts as a private address), an IPv6 address
// in brackets, or a name
const PRIVATE_IPV4 = [
    /^127\./,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // the range Tailscale (and other private networks) hand out
];
const PRIVATE_IPV6 = [
    /^\[::1\]$/, // this computer
    /^\[f[cd][0-9a-f]{2}:/i, // private (fc00::/7)
    /^\[fe[89ab][0-9a-f]:/i, // link-local (fe80::/10)
];
const OWN_NAMES = [/^localhost$/, /\.localhost$/, /\.ts\.net$/, /\.local$/, /\.lan$/, /\.home\.arpa$/, /\.internal$/];
const isOwnNetwork = host =>
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
        ? PRIVATE_IPV4.some(re => re.test(host))
        : host.startsWith("[")
          ? PRIVATE_IPV6.some(re => re.test(host))
          : OWN_NAMES.some(re => re.test(host));
const YOUTUBE = /^(www\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be|m\.youtube\.com)$/;

/** the hosts of servers you've added yourself: media and reading servers, and switched-on extensions' companions */
function ownServerHosts() {
    const hosts = new Set();
    const add = u => {
        try {
            hosts.add(new URL(String(u)).hostname.toLowerCase());
        } catch {
            /* not an address: nothing to add */
        }
    };
    for (const l of [...(meta.settings.libs || []), ...(meta.settings.rlibs || [])]) if (l && l.url) add(l.url);
    if (typeof EXT !== "undefined") for (const x of EXT.list) if (x.on) add(extCompanionURL(x));
    return hosts;
}

/** may the player play this? `src` is a source ({ file } or { url }) or an address */
function isOwnSource(src) {
    if (src && typeof src === "object" && src.file) return true; // a file you opened on this device
    const address = typeof src === "string" ? src : src && src.url;
    if (!address) return false;
    if (address.startsWith("blob:")) return true; // made here, from a file of yours
    let url;
    try {
        url = new URL(address.replace(/\{[^}]*\}/g, "x")); // a link pattern is judged by where it points
    } catch {
        return false;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return YOUTUBE.test(host) || isOwnNetwork(host) || ownServerHosts().has(host);
}

// what to say when an address isn't one of yours
const NOT_OWN_SOURCE =
    "Watch plays your own videos: files on this device, your own network, or a server you've added under Your servers.";
