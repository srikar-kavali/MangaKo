const REPORT_URL = 'https://api.mangadex.network/report';

async function sendReport({ url, success, cached, bytes, duration }) {
    try {
        await fetch(REPORT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, success, cached, bytes, duration }),
        });
    } catch {

    }
}

export default async function handler(req, res) {
    const { base, hash, file, quality = 'data' } = req.query;
    if (!base || !hash || !file) {
        return res.status(400).json({ error: 'base, hash, and file are required' });
    }

    const upstreamUrl = `${base}/${quality}/${hash}/${file}`;
    const start = Date.now();

    try {
        const r = await fetch(upstreamUrl);
        const duration = Date.now() - start;
        const cached = (r.headers.get('x-cache') || '').toUpperCase().startsWith('HIT');

        if (!r.ok) {
            await sendReport({ url: upstreamUrl, success: false, cached, bytes: 0, duration });
            return res.status(r.status).json({ error: `Upstream MangaDex@Home error: ${r.status}` });
        }

        const buf = Buffer.from(await r.arrayBuffer());
        await sendReport({ url: upstreamUrl, success: true, cached, bytes: buf.length, duration });

        const contentType = r.headers.get('content-type') || 'image/jpeg';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(200).send(buf);

    } catch (e) {
        const duration = Date.now() - start;
        await sendReport({ url: upstreamUrl, success: false, cached: false, bytes: 0, duration });
        console.error('mangadex-image proxy error:', e);
        return res.status(502).json({ error: 'Failed to fetch image', detail: e.message });
    }
}