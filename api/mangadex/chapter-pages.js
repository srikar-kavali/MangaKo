const MANGADEX_API = 'https://api.mangadex.org';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { chapterId, quality = 'data' } = req.query; // quality: 'data' | 'data-saver'
    if (!chapterId) return res.status(400).json({ error: 'chapterId is required' });
    if (!['data', 'data-saver'].includes(quality)) {
        return res.status(400).json({ error: "quality must be 'data' or 'data-saver'" });
    }

    try {
        const r = await fetch(`${MANGADEX_API}/at-home/server/${encodeURIComponent(chapterId)}`);
        if (!r.ok) {
            const text = await r.text();
            return res.status(r.status).json({ error: `at-home lookup failed: ${r.status}`, detail: text });
        }
        const json = await r.json();
        if (json.result !== 'ok') {
            return res.status(502).json({ error: 'MangaDex at-home returned a non-ok result', detail: json });
        }

        const { baseUrl, chapter } = json;
        const filenames = quality === 'data-saver' ? chapter.dataSaver : chapter.data;

        const proto = req.headers['x-forwarded-proto'] || 'https';
        const selfBase = `${proto}://${req.headers.host}`;

        const pages = (filenames || []).map((filename) => {
            const proxyParams = new URLSearchParams({
                base: baseUrl,
                hash: chapter.hash,
                file: filename,
                quality,
            });
            return `${selfBase}/api/mangadex/image?${proxyParams.toString()}`;
        });

        return res.status(200).json({ pages, hash: chapter.hash, quality });
    } catch (e) {
        console.error('mangadex-chapter-pages error:', e);
        return res.status(500).json({ error: 'Internal server error', detail: e.message });
    }
}