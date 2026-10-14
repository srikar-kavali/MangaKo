export function normalizedTitle(text = '') {
    return String(text).toLowerCase().normalize('NFKC')
        .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export async function findMangapillMatch(title, search, limit = 15) {
    const wanted = normalizedTitle(title);
    if (!wanted || wanted.length < 3) return null;
    const results = await search(title, limit);
    if (!Array.isArray(results)) return null;
    const matches = results.filter(item =>
        item?.url?.startsWith('https://mangapill.com/manga/')
        && normalizedTitle(item.title) === wanted
    );
    const unique = [...new Map(matches.map(item => [item.url, item])).values()];
    return unique.length === 1 ? unique[0] : null;
}
