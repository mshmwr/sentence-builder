#!/usr/bin/env node
/* ------------------------------------------------------------------ *
 *  Daily job (see .github/workflows/daily-cnn-sentences.yml): scrape
 *  CNN's homepage for real headline sentences AND pre-generate every
 *  one's puzzle (Chinese translation + tile set + grammar notes) with
 *  this job's own Gemini key, via generatePuzzlesBatch() in
 *  src/generate.js — the whole day's headlines go in ONE Gemini call,
 *  not one call per headline (that's what a free-tier key's per-minute
 *  quota can't survive). The result — sentence + puzzle together — is
 *  written to public/daily-sentences.json, so the client never calls
 *  Gemini for the daily list: it just reads this one small file and
 *  plays. That's what makes "今日例句" work offline / on minimal data —
 *  everyone shares the one Gemini call this job already made today.
 * ------------------------------------------------------------------ */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { generatePuzzlesBatch } from "../src/generate.js";

const HOMEPAGE = "https://edition.cnn.com/";
const OUT_PATH = fileURLToPath(new URL("../public/daily-sentences.json", import.meta.url));

// CNN article URLs are date-stamped: /2026/08/28/world/some-slug/index.html —
// this shape has stayed stable across CNN's markup redesigns, so anchoring on
// it is more durable than any particular CSS class name.
const ARTICLE_PATH_RE = /^\/\d{4}\/\d{2}\/\d{2}\//;

function normalizeText(s) {
  return s.replace(/\s+/g, " ").trim();
}

// leading UI labels CNN concats onto card text with no space, e.g. "Video The
// wobbliest royal palace 2:25" or "Analysisby David Goldman ..." (byline glued
// straight onto the "Analysis" badge) — card chrome, not a sentence, so no \b
// is required: the junk word often runs directly into the next one.
const CARD_LABEL_RE = /^(Video|Gallery|Photos?|Live|Watch|Analysis|Opinion|Interactive|Ad Feature Video)/i;
const DURATION_RE = /\b\d{1,2}:\d{2}\b/; // video runtime, e.g. "2:25"
// trailing UI chrome CNN appends to live-blog headlines, e.g. "... Show all"
const TRAILING_JUNK_RE = /\s+Show all$/i;

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

    const text = normalizeText($(el).text()).replace(TRAILING_JUNK_RE, "");
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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set — cannot pre-generate today's puzzles.");
  }

  const html = await fetchHomepage();
  const candidates = extractCandidates(html);

  if (candidates.length < 3) {
    throw new Error(
      `Only found ${candidates.length} candidate sentence(s) — CNN's markup may have changed. Leaving existing daily-sentences.json untouched.`
    );
  }

  const sentences = await generatePuzzlesBatch(candidates.slice(0, POOL_SIZE), apiKey);
  if (sentences.length < 3) {
    throw new Error(
      `Only ${sentences.length} sentence(s) got a puzzle out of the batch call — leaving existing daily-sentences.json untouched.`
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const payload = {
    date: today,
    fetchedAt: new Date().toISOString(),
    source: HOMEPAGE,
    sentences,
  };

  await writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`Wrote ${sentences.length} sentences (with puzzles) to ${OUT_PATH}`);
  for (const s of sentences) console.log(`  - ${s.en}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
