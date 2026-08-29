#!/usr/bin/env node
/* ------------------------------------------------------------------ *
 *  Daily job (see .github/workflows/daily-cnn-sentences.yml): scrape
 *  CNN's homepage for 3 real headline sentences and write them to
 *  public/daily-sentences.json. No AI call here — this only harvests
 *  raw English text; the client generates the actual puzzle (Chinese
 *  translation + tile set) on demand with the user's own Gemini key,
 *  via generatePuzzleFromEnglish() in src/generate.js.
 * ------------------------------------------------------------------ */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const HOMEPAGE = "https://edition.cnn.com/";
const OUT_PATH = fileURLToPath(new URL("../public/daily-sentences.json", import.meta.url));

// CNN article URLs are date-stamped: /2026/08/28/world/some-slug/index.html —
// this shape has stayed stable across CNN's markup redesigns, so anchoring on
// it is more durable than any particular CSS class name.
const ARTICLE_PATH_RE = /^\/\d{4}\/\d{2}\/\d{2}\//;

function normalizeText(s) {
  return s.replace(/\s+/g, " ").trim();
}

// leading UI labels CNN concats onto card text, e.g. "Video The wobbliest royal
// palace 2:25" (label + headline + duration) or "Gallery ..." — these aren't
// sentences, they're card chrome, so anything shaped like it gets rejected.
const CARD_LABEL_RE = /^(Video|Gallery|Photos?|Live|Watch|Analysis|Opinion|Ad Feature Video)\b/i;
const DURATION_RE = /\b\d{1,2}:\d{2}\b/; // video runtime, e.g. "2:25"

function isSentenceLike(text) {
  const words = text.split(" ").filter(Boolean);
  if (words.length < 6 || words.length > 40) return false;
  if (text === text.toUpperCase()) return false; // nav/label chrome, e.g. "LIVE UPDATES"
  if (CARD_LABEL_RE.test(text)) return false;
  if (DURATION_RE.test(text)) return false;
  return true;
}

async function fetchHomepage() {
  const res = await fetch(HOMEPAGE, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`CNN homepage fetch failed: HTTP ${res.status}`);
  return res.text();
}

function extractCandidates(html) {
  const $ = cheerio.load(html);
  const seenUrls = new Set();
  const seenText = new Set();
  const candidates = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    let path;
    try {
      path = href.startsWith("http") ? new URL(href).pathname : href;
    } catch {
      return;
    }
    if (!ARTICLE_PATH_RE.test(path)) return;
    if (seenUrls.has(path)) return; // same article linked twice (image + headline)

    const text = normalizeText($(el).text());
    if (!isSentenceLike(text)) return;
    if (seenText.has(text.toLowerCase())) return;

    seenUrls.add(path);
    seenText.add(text.toLowerCase());
    candidates.push({ en: text, url: `https://edition.cnn.com${path}` });
  });

  return candidates;
}

// default 3 shown, "load more" reveals more in batches of 3 from this same
// pool — no re-scraping, it's all fetched once per day up front
const POOL_SIZE = 12;

async function main() {
  const html = await fetchHomepage();
  const candidates = extractCandidates(html);

  if (candidates.length < 3) {
    throw new Error(
      `Only found ${candidates.length} candidate sentence(s) — CNN's markup may have changed. Leaving existing daily-sentences.json untouched.`
    );
  }

  const sentences = candidates.slice(0, POOL_SIZE);
  const today = new Date().toISOString().slice(0, 10);
  const payload = {
    date: today,
    fetchedAt: new Date().toISOString(),
    source: HOMEPAGE,
    sentences,
  };

  await writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`Wrote ${sentences.length} sentences to ${OUT_PATH}`);
  for (const s of sentences) console.log(`  - ${s.en}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
