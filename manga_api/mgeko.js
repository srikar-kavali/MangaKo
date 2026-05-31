const BASE = process.env.EXPO_PUBLIC_CHAPTERS_API;

function cleanBase(base) {
    return base?.endsWith("/") ? base.slice(0, -1) : base;
}

const API_BASE = cleanBase(BASE);

export function proxied(src) {
    if (!src) return "";
    if (src.startsWith(API_BASE)) return src;
    return `${API_BASE}/api/image_proxy?url=${encodeURIComponent(src)}`;
}