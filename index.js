const { addonBuilder, serveHttp } = require('stremio-addon-sdk');
const express = require('express');
const axios = require('axios');

const manifest = {
    id: "org.filmxy.multi.4k",
    version: "1.2.0",
    name: "Filmxy Multi 4K + Subs",
    description: "Streams from Filmxy.vip, Streamx.sh, Cinevo.site, Fluxtv.qzz.io (Up to 4K)",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    logo: "https://i.imgur.com/8z5zZ2L.png"
};

const builder = new addonBuilder(manifest);

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

async function fetchHTML(url) {
    try {
        const { data } = await axios.get(url, {
            headers: { "User-Agent": USER_AGENT },
            timeout: 10000
        });
        return data;
    } catch (err) {
        console.error(`Fetch failed: ${url} - ${err.message}`);
        return null;
    }
}

async function scrapeSite(imdbId, site) {
    const streams = [];
    let baseUrl = "";

    switch (site) {
        case "filmxy": baseUrl = `https://filmxy.vip/search/${imdbId}`; break;
        case "streamx": baseUrl = `https://streamx.sh/search/${imdbId}`; break;
        case "cinevo": baseUrl = `https://cinevo.site/search/${imdbId}`; break;
        case "fluxtv": baseUrl = `https://fluxtv.qzz.io/search/${imdbId}`; break;
    }

    const html = await fetchHTML(baseUrl);
    if (!html) return streams;

    // Basic regex fallback (will be improved later)
    const urlRegex = /(https?:\/\/[^\s"']+\.(mp4|m3u8))/gi;
    let match;
    while ((match = urlRegex.exec(html)) !== null) {
        const link = match[1];
        const lower = link.toLowerCase();
        let quality = "1080p";
        if (lower.includes("2160") || lower.includes("4k")) quality = "4K";
        else if (lower.includes("720")) quality = "720p";

        streams.push({
            name: `${site.toUpperCase()} • ${quality}`,
            title: `${quality} - ${site}`,
            url: link,
            behaviorHints: { bingeGroup: site }
        });
    }

    return streams;
}

builder.defineStreamHandler(async ({ type, id }) => {
    console.log(`🎬 Request: ${type} ${id}`);

    const sources = ["filmxy", "streamx", "cinevo", "fluxtv"];
    const results = await Promise.allSettled(sources.map(site => scrapeSite(id, site)));

    let allStreams = results.flatMap(r => r.value || []);

    // Remove duplicates
    const seen = new Set();
    allStreams = allStreams.filter(s => {
        if (seen.has(s.url)) return false;
        seen.add(s.url);
        return true;
    });

    // Sort 4K first
    allStreams.sort((a, b) => (b.name.includes("4K") ? 1 : 0) - (a.name.includes("4K") ? 1 : 0));

    return { streams: allStreams };
});

const app = express();
serveHttp(builder.getInterface(), app);

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => {
    console.log(`✅ Filmxy Multi Addon is running on port ${PORT}`);
    console.log(`Manifest: http://localhost:${PORT}/manifest.json`);
});
