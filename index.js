const { addonBuilder, serveHttp } = require('stremio-addon-sdk');
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const manifest = {
    id: "org.filmxy.multi.4k",
    version: "1.1.0",
    name: "Filmxy Multi 4K + Subs",
    description: "4K streams from Filmxy.vip • Streamx.sh • Cinevo.site • Fluxtv.qzz.io with subtitles",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    logo: "https://i.imgur.com/8z5zZ2L.png",
    background: "https://i.imgur.com/4k-background.jpg",
    catalogs: []
};

const builder = new addonBuilder(manifest);

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

async function fetchHTML(url) {
    try {
        const { data } = await axios.get(url, {
            headers: {
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/xhtml+xml,application/xml",
                "Referer": "https://www.google.com/"
            },
            timeout: 12000,
            maxRedirects: 5
        });
        return data;
    } catch (err) {
        console.error(`❌ Fetch error ${url}: ${err.message}`);
        return null;
    }
}

async function scrapeSite(imdbId, site) {
    const streams = [];
    let url = "";

    switch (site) {
        case "filmxy": url = `https://filmxy.vip/search/${imdbId}`; break;
        case "streamx": url = `https://streamx.sh/search/${imdbId}`; break;
        case "cinevo": url = `https://cinevo.site/search/${imdbId}`; break;
        case "fluxtv": url = `https://fluxtv.qzz.io/search/${imdbId}`; break;
    }

    const html = await fetchHTML(url);
    if (!html) return streams;

    const $ = cheerio.load(html);

    // Extract possible stream links (update selectors after inspecting sites)
    const possibleLinks = [
        ...$('a[href*="embed"], a[href*=".m3u8"], a[href*=".mp4"], iframe[src], video source').get(),
        ...$('[data-src*="http"], [data-url*="http"]').get()
    ];

    for (const el of possibleLinks) {
        let link = $(el).attr('href') || $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-url');
        if (!link) continue;
        if (link.startsWith('//')) link = 'https:' + link;
        if (!link.startsWith('http')) continue;

        const lowerLink = link.toLowerCase();
        let quality = "1080p";
        if (lowerLink.includes("2160") || lowerLink.includes("4k") || lowerLink.includes("uhd")) quality = "4K";
        else if (lowerLink.includes("720")) quality = "720p";

        streams.push({
            name: `${site.toUpperCase()} • ${quality}`,
            title: `${quality} - ${site}`,
            url: link,
            behaviorHints: {
                notWebReady: false,
                bingeGroup: site
            },
            subtitles: [
                { url: `https://www.opensubtitles.org/rest/v1/search?imdbid=${imdbId.replace('tt','')}&lang=en`, lang: "en" },
                { url: `https://api.opensubtitles.com/api/v1/subtitles?imdb_id=${imdbId.replace('tt','')}&languages=en`, lang: "en" }
            ]
        });
    }

    return streams;
}

builder.defineStreamHandler(async ({ type, id }) => {
    console.log(`🎬 Request: ${type} ${id}`);

    const sources = ["filmxy", "streamx", "cinevo", "fluxtv"];
    const results = await Promise.allSettled(sources.map(site => scrapeSite(id, site)));

    let allStreams = results
        .filter(r => r.status === "fulfilled")
        .flatMap(r => r.value);

    // Remove duplicates
    const seen = new Set();
    allStreams = allStreams.filter(s => {
        if (seen.has(s.url)) return false;
        seen.add(s.url);
        return true;
    });

    // Prioritize 4K
    allStreams.sort((a, b) => {
        const score = q => q.includes("4K") ? 4 : q.includes("1080") ? 3 : q.includes("720") ? 2 : 1;
        return score(b.name) - score(a.name);
    });

    return { streams: allStreams };
});

const app = express();
serveHttp(builder.getInterface(), app);

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => {
    console.log(`🚀 Filmxy Multi Addon running on http://localhost:${PORT}/manifest.json`);
});
