const BASE = process.env.EXPO_PUBLIC_CHAPTERS_API;

function cleanBase(base) {
    return base?.endsWith("/") ? base.slice(0, -1) : base;
}

const API_BASE = cleanBase(BASE);

export function proxied(src) {
    if (!src) return "";
    return `https://manga-image-proxy.mangako.workers.dev/?url=${encodeURIComponent(src)}`;
}