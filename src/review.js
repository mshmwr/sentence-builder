/* ------------------------------------------------------------------ *
 *  Pure spaced-repetition scheduling — no Firebase, no React, so it's
 *  directly unit-testable the same way engine.js is (see tests/review.test.js).
 * ------------------------------------------------------------------ */

// prevInterval: days since this sentence was last scheduled (0 = never
// reviewed before). starsEarned: 0-3 from the attempt that just finished.
// A shaky attempt (0-1 star) resets to "tomorrow" rather than compounding a
// penalty — the point is to resurface it soon, not bury it further out.
export function nextInterval(prevInterval, starsEarned) {
  if (starsEarned <= 1) return 1;
  if (starsEarned === 2) {
    return prevInterval <= 0 ? 1 : Math.min(30, Math.round(prevInterval * 1.3));
  }
  return prevInterval <= 0 ? 1 : Math.min(60, Math.round(prevInterval * 2.2)); // starsEarned === 3
}
