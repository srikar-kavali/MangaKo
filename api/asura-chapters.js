// api/asura-chapters.js
// Vercel serverless function — serves chapter data from chapter_data.json
// Place chapter_data.json in the root of your project (same level as /api)

import chapterData from '../extractor/chapter_data.json';

export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { seriesId, chapterId } = req.query;

    if (!seriesId) {
        return res.status(400).json({ error: 'seriesId is required' });
    }

    // IDs in hardcodedManhwas.js now match chapter_data.json keys directly
    const seriesData = chapterData[seriesId];

    if (!seriesData) {
        return res.status(404).json({
            error: `Series not found: ${seriesId}`,
            availableKeys: Object.keys(chapterData).slice(0, 10),
        });
    }

    // If chapterId requested, return just that chapter's pages
    if (chapterId) {
        const pages = seriesData.chapters[chapterId];
        if (!pages) {
            return res.status(404).json({ error: `Chapter ${chapterId} not found` });
        }
        return res.status(200).json({ pages });
    }

    // Otherwise return the full chapter list (no image arrays — just ids + titles)
    const chapters = Object.keys(seriesData.chapters)
        .map(id => ({
            id,
            title: `Chapter ${id}`,
            number: parseFloat(id) || 0,
        }))
        .sort((a, b) => a.number - b.number);

    return res.status(200).json({ chapters });
}