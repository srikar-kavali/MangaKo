// Older clients may still have cached proxy URLs. Never fetch a caller-supplied
// MangaDex@Home base URL on the application origin.
export default function handler(_req, res) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(410).json({ error: 'Image proxy retired. Reload the chapter to refresh its page URLs.' });
}
