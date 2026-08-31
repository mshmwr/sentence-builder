/* ------------------------------------------------------------------ *
 *  Reads public/daily-sentences.json — CNN headline sentences dropped
 *  there once a day by .github/workflows/daily-cnn-sentences.yml, each
 *  already carrying its generated puzzle (translation + tiles + notes).
 *  Pure data fetch; no AI call — that already happened in CI, once, for
 *  everyone, which is what lets the daily list be played offline / on
 *  minimal data after this one small JSON download.
 * ------------------------------------------------------------------ */

export async function fetchDailySentences() {
  const res = await fetch(`/daily-sentences.json?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`daily-sentences.json HTTP ${res.status}`);
  const data = await res.json();
  // defensive filter, not the normal case: drops any entry that predates
  // this format or whose puzzle generation failed in CI that day
  const sentences = (Array.isArray(data.sentences) ? data.sentences : []).filter(
    (s) => s?.puzzle?.zh && Array.isArray(s.puzzle.accepted?.[0]) && s.puzzle.accepted[0].length > 0
  );
  if (sentences.length === 0) {
    throw new Error("今日例句是空的");
  }
  return { ...data, sentences };
}
