/* ------------------------------------------------------------------ *
 *  Reads public/daily-sentences.json — 3 CNN headline sentences dropped
 *  there once a day by .github/workflows/daily-cnn-sentences.yml. Pure
 *  data fetch; no AI call (that happens per-sentence, on demand, in
 *  generatePuzzleFromEnglish).
 * ------------------------------------------------------------------ */

export async function fetchDailySentences() {
  const res = await fetch(`/daily-sentences.json?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`daily-sentences.json HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.sentences) || data.sentences.length === 0) {
    throw new Error("今日例句是空的");
  }
  return data;
}
