export function mergeManga(md, wc) {
    return {
        id: wc.id,
        title: md?.title || wc.title,
        description: md?.description ?? wc.description,
        authors: (md?.authors?.length ? md.authors : wc.authors) || [],
        artists: (md?.artists?.length ? md.artists : wc.artists) || [],
        tags: (md?.tags?.length ? md.tags : wc.tags) || [],
        coverUrl: md?.coverUrl || wc.cover_url || null,
        chapters: wc.chapters || [],
    };
}
