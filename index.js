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
    logo: "https://i.imgur.com/8z5zZ2L.png"
};

const builder = new addonBuilder(manifest);

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

async function fetchHTML(url) {
    try {
        const { data } = await axios.get(url, {
            headers: { "User-Agent": USER_AGENT },
            timeout: 12000
        });
        return data;
    } catch (err) {
        console.error(`Fetch error ${url}: ${err.message}`);
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

    const possibleLinks = $('a[href*="embed"], a[href*=".m3u8"], a[href*=".mp4"], iframe, video source, [data-src]').get();

    for (const el of possibleLinks) {
        let link = $(el).attr('href') || $(el).attr('src') || $(el).attr('data-src');
        if (!link) continue;
        if (link.startsWith('//')) link = 'https:' + link;
        if (!link.startsWith('http')) continue;

        const lower = link.toLowerCase();
        let quality = lower.includes("2160") || lower.includes("4k") ? "4K" : 
                     lower.includes("720") ? "720p" : "1080p";

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
    console.log(`Request: ${type} ${id}`);

    const sources = ["filmxy", "streamx", "cinevo", "fluxtv"];
    const results = await Promise.allSettled(sources.map(s => scrapeSite(id, s)));

    let streams = results.flatMap(r => r.value || []);

    // Remove duplicates and sort 4K first
    const seen = new Set();
    streams = streams.filter(s => {
        if (seen.has(s.url)) return false;
        seen.add(s.url);
        return true;
    }).sort((a, b) => b.name.includes("4K") ? 1 : -1);

    return { streams };
});

const app = express();
serveHttp(builder.getInterface(), app);

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => console.log(`Addon running on port ${PORT}`));
