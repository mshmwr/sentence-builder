#!/usr/bin/env node
/* Throwaway diagnostic — NOT part of the app. Dumps raw CNN homepage anchor
 * markup for cards whose extracted text looks like a headline+dek
 * concatenation, so we can see the real HTML structure and fix
 * extractCandidates() in scripts/fetch-cnn-sentences.mjs precisely. */
import * as cheerio from "cheerio";

const HOMEPAGE = "https://edition.cnn.com/";
const ARTICLE_PATH_RE = /^\/\d{4}\/\d{2}\/\d{2}\//;
const LIVE_BLOG_PATH_RE = /\/live-news\//;

function normalizeText(s) {
  return s.replace(/\s+/g, " ").trim();
}

async function main() {
  const res = await fetch(HOMEPAGE, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`CNN homepage fetch failed: HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const seen = new Set();
  let longCount = 0;
  let printedGeneric = 0;

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    let path;
    try {
      path = href.startsWith("http") ? new URL(href).pathname : href;
    } catch {
      return;
    }
    if (!ARTICLE_PATH_RE.test(path)) return;
    if (LIVE_BLOG_PATH_RE.test(path)) return;
    if (seen.has(path)) return;

    const text = normalizeText($(el).text());
    const words = text.split(" ").filter(Boolean);
    if (words.length < 6) return;
    seen.add(path);

    const isSuspect =
      /starshield|spacex/i.test(text) || words.length > 28;

    if (isSuspect && longCount < 4) {
      longCount++;
      console.log("\n=== SUSPECT CARD ===");
      console.log("path:", path);
      console.log("word count:", words.length);
      console.log("text:", text);
      console.log("--- outer HTML (first 3000 chars) ---");
      console.log($.html(el).slice(0, 3000));
      console.log("--- end outer HTML ---");
    } else if (!isSuspect && printedGeneric < 2 && words.length >= 6 && words.length <= 15) {
      printedGeneric++;
      console.log("\n=== GENERIC CARD (for comparison) ===");
      console.log("path:", path);
      console.log("word count:", words.length);
      console.log("text:", text);
      console.log("--- outer HTML (first 1500 chars) ---");
      console.log($.html(el).slice(0, 1500));
      console.log("--- end outer HTML ---");
    }
  });

  console.log(`\nTotal unique article anchors seen: ${seen.size}`);
  console.log(`Suspect cards printed: ${longCount}, generic cards printed: ${printedGeneric}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
