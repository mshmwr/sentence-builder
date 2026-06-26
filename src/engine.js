/* ------------------------------------------------------------------ *
 *  拼句 — game engine (pure, framework-free)
 *
 *  Single source of truth: `tiles` is the only tile list.
 *  `placedIds` (ordered) + `lockedIds` derive everything else, so the
 *  "each tile is in exactly one place" invariant can't drift.
 *  Judging is multi-answer (any accepted permutation) & case-insensitive.
 *
 *  Every function here is covered by tests/engine.test.js.
 * ------------------------------------------------------------------ */

const norm = (w) => w.toLowerCase();

export function makeTiles(puzzle) {
  const base = puzzle.accepted[0]; // all accepted variants share this multiset
  const correct = base.map((w, i) => ({ id: `c${i}`, word: w, trap: false }));
  const traps = puzzle.distractors.map((w, i) => ({ id: `d${i}`, word: w, trap: true }));
  return [...correct, ...traps];
}

export function newGame(puzzle) {
  return {
    tiles: makeTiles(puzzle),
    placedIds: [],
    lockedIds: [],
    hints: 0,
    misses: 0,
    status: "playing", // "playing" | "correct"
    wrongIdx: [],
    lastWrongSig: null, // arrangement we already penalised
  };
}

/* ---- selectors ---- */
const tileById = (g, id) => g.tiles.find((t) => t.id === id);
export const poolTiles = (g) => g.tiles.filter((t) => !g.placedIds.includes(t.id));
export const placedTiles = (g) => g.placedIds.map((id) => tileById(g, id));
const placedWords = (g) => g.placedIds.map((id) => tileById(g, id).word);
export const stars = (g) => Math.max(1, 3 - g.hints - g.misses);

/* ---- judging ---- */
function matchesAny(puzzle, words) {
  return puzzle.accepted.some(
    (v) => v.length === words.length && v.every((w, i) => norm(w) === norm(words[i]))
  );
}
function bestVariant(puzzle, words) {
  let best = puzzle.accepted[0];
  let bestScore = -Infinity;
  for (const v of puzzle.accepted) {
    let m = 0;
    const n = Math.min(words.length, v.length);
    for (let i = 0; i < n; i++) if (norm(v[i]) === norm(words[i])) m++;
    const score = m - Math.abs(v.length - words.length) * 0.01;
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best;
}

/* ---- actions: all pure (state -> state) ---- */
export function placeTile(g, tileId) {
  if (g.status === "correct" || g.placedIds.includes(tileId)) return g;
  return { ...g, placedIds: [...g.placedIds, tileId], wrongIdx: [] };
}

export function removeTile(g, pos) {
  if (g.status === "correct") return g;
  const id = g.placedIds[pos];
  if (id == null || g.lockedIds.includes(id)) return g;
  return { ...g, placedIds: g.placedIds.filter((_, i) => i !== pos), wrongIdx: [] };
}

export function clearAll(g) {
  if (g.status === "correct") return g;
  return {
    ...g,
    placedIds: g.placedIds.filter((id) => g.lockedIds.includes(id)),
    wrongIdx: [],
  };
}

export function check(g, puzzle) {
  if (g.status === "correct") return g;
  const words = placedWords(g);
  if (words.length === 0) return g; // empty check is a no-op (no penalty)

  if (matchesAny(puzzle, words)) {
    return { ...g, status: "correct", wrongIdx: [] };
  }

  const v = bestVariant(puzzle, words);
  const wrongIdx = [];
  for (let i = 0; i < words.length; i++) {
    if (i >= v.length || norm(words[i]) !== norm(v[i])) wrongIdx.push(i);
  }
  // only mismatched positions are flagged — a correct prefix stays clean
  const sig = g.placedIds.join(",");
  const repeat = sig === g.lastWrongSig; // identical re-check -> no extra miss
  return {
    ...g,
    wrongIdx,
    misses: repeat ? g.misses : g.misses + 1,
    lastWrongSig: sig,
  };
}

export function hint(g, puzzle) {
  if (g.status === "correct") return g;
  const words = placedWords(g);
  const v = bestVariant(puzzle, words);

  // first slot that is empty or wrong vs the best-fit target
  let i = 0;
  while (i < v.length && i < words.length && norm(words[i]) === norm(v[i])) i++;
  if (i >= v.length) return g; // nothing to correct within target length

  const need = v[i];
  let placedIds = [...g.placedIds];

  // if a wrong tile occupies slot i, evict it, then insert the correct tile
  // *at position i* (not appended at the end)
  if (i < placedIds.length) {
    if (g.lockedIds.includes(placedIds[i])) return g;
    placedIds.splice(i, 1);
  }

  const placedSet = new Set(placedIds);
  let tile = g.tiles.find((t) => norm(t.word) === norm(need) && !placedSet.has(t.id));
  if (!tile) {
    // the needed word is sitting (wrongly) elsewhere — reclaim an unlocked one
    const stealId = placedIds.find(
      (id) => norm(tileById(g, id).word) === norm(need) && !g.lockedIds.includes(id)
    );
    if (stealId != null) {
      placedIds = placedIds.filter((id) => id !== stealId);
      tile = tileById(g, stealId);
    }
  }
  if (!tile) return g;

  placedIds.splice(i, 0, tile.id);
  return {
    ...g,
    placedIds,
    lockedIds: [...g.lockedIds, tile.id],
    hints: g.hints + 1,
    wrongIdx: [],
  };
}
