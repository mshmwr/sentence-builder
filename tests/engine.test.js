import * as E from "../src/engine.js";

/* ---- tiny zero-dependency assert harness ---- */
let pass = 0,
  fail = 0;
const fails = [];
function ok(name, cond) {
  if (cond) pass++;
  else {
    fail++;
    fails.push(name);
    console.log("  \u2717 " + name);
  }
}
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b));

/* ---- fixture ---- */
// tile ids: c0..c4 = I drink coffee every morning, d0..d3 = drinks a mornings in
const P1 = {
  zh: "我每天早上喝咖啡。",
  accepted: [
    ["I", "drink", "coffee", "every", "morning"],
    ["every", "morning", "I", "drink", "coffee"], // adverbial fronting = also valid
  ],
  distractors: ["drinks", "a", "mornings", "in"],
};
const poolId = (g, w) =>
  E.poolTiles(g).find((t) => t.word.toLowerCase() === w.toLowerCase()).id;
function placeWords(g, words) {
  for (const w of words) g = E.placeTile(g, poolId(g, w));
  return g;
}

/* ---- structural / source-of-truth ---- */
(() => {
  const g = E.newGame(P1);
  eq("newGame: 9 tiles total", g.tiles.length, 9);
  eq("newGame: pool starts full", E.poolTiles(g).length, 9);
  eq("newGame: nothing placed", g.placedIds.length, 0);
  ok("newGame: status playing", g.status === "playing");
})();

(() => {
  let g = E.newGame(P1);
  const id = poolId(g, "I");
  g = E.placeTile(g, id);
  ok("place: leaves pool", !E.poolTiles(g).some((t) => t.id === id));
  ok("place: enters rack", g.placedIds.includes(id));
  eq("invariant: pool + placed == all", E.poolTiles(g).length + g.placedIds.length, 9);
  const g2 = E.placeTile(g, id);
  eq("place: same tile twice is a no-op", g2.placedIds.length, 1);
})();

(() => {
  let g = E.newGame(P1);
  g = placeWords(g, ["I", "drink"]);
  g = E.removeTile(g, 0);
  eq("remove: returns to pool", E.poolTiles(g).length, 8);
  eq("remove: rack shrinks", g.placedIds.length, 1);
})();

/* ---- empty check is a no-op ---- */
(() => {
  let g = E.newGame(P1);
  g = E.check(g, P1);
  eq("empty check costs no miss", g.misses, 0);
  ok("empty check stays playing", g.status === "playing");
})();

/* ---- correct path + multi-answer ---- */
(() => {
  let g = E.newGame(P1);
  g = placeWords(g, ["I", "drink", "coffee", "every", "morning"]);
  g = E.check(g, P1);
  ok("correct: variant 1 accepted", g.status === "correct");
  eq("correct: 3 stars when clean", E.stars(g), 3);
})();

(() => {
  let g = E.newGame(P1);
  g = placeWords(g, ["every", "morning", "I", "drink", "coffee"]);
  g = E.check(g, P1);
  ok("multi-answer: fronting variant also accepted", g.status === "correct");
})();

/* ---- correct prefix not flagged ---- */
(() => {
  let g = E.newGame(P1);
  g = placeWords(g, ["I", "drinks", "coffee"]);
  g = E.check(g, P1);
  eq("only the wrong tile is flagged", g.wrongIdx, [1]);
  eq("one miss recorded", g.misses, 1);
})();

/* ---- repeated identical check ---- */
(() => {
  let g = E.newGame(P1);
  g = placeWords(g, ["I", "drinks", "coffee"]);
  g = E.check(g, P1);
  g = E.check(g, P1);
  g = E.check(g, P1);
  eq("repeated identical check = still 1 miss", g.misses, 1);
  g = E.removeTile(g, 2);
  g = E.check(g, P1);
  eq("changed arrangement counts a new miss", g.misses, 2);
})();

/* ---- hint fixes the FIRST wrong slot ---- */
(() => {
  let g = E.newGame(P1);
  g = placeWords(g, ["I", "drinks"]);
  g = E.hint(g, P1);
  eq("hint repairs slot 1 to 'drink'", E.placedTiles(g).map((t) => t.word), ["I", "drink"]);
  ok("repaired tile is locked", g.lockedIds.length === 1);
  eq("hint counted", g.hints, 1);
  ok("evicted 'drinks' back in pool", E.poolTiles(g).some((t) => t.word === "drinks"));
})();

/* ---- hint works when rack is full + wrong ---- */
(() => {
  let g = E.newGame(P1);
  g = placeWords(g, ["I", "drinks", "coffee", "every", "morning"]);
  const before = g.placedIds.length;
  g = E.hint(g, P1);
  eq("rack still full after hint", g.placedIds.length, before);
  eq("slot 1 repaired", E.placedTiles(g)[1].word, "drink");
  g = E.check(g, P1);
  ok("completes after repair", g.status === "correct");
})();

/* ---- locked tiles can't be removed / cleared ---- */
(() => {
  let g = E.newGame(P1);
  g = E.hint(g, P1);
  const g2 = E.removeTile(g, 0);
  eq("locked tile can't be removed", g2.placedIds.length, 1);
  g = placeWords(g, ["drinks"]);
  g = E.clearAll(g);
  eq("clear keeps locked, drops the rest", E.placedTiles(g).map((t) => t.word), ["I"]);
})();

/* ---- hint advances on an empty rack ---- */
(() => {
  let g = E.newGame(P1);
  g = E.hint(g, P1);
  eq("hint(empty): places first word locked", E.placedTiles(g).map((t) => t.word), ["I"]);
})();

/* ---- stars floor at 1 ---- */
(() => {
  let g = E.newGame(P1);
  g.hints = 5;
  g.misses = 5;
  eq("stars: never below 1", E.stars(g), 1);
})();

/* ---- no duplicate tile id ever placed ---- */
(() => {
  let g = E.newGame(P1);
  g = placeWords(g, ["I", "drink", "coffee", "every", "morning"]);
  const ids = g.placedIds;
  eq("integrity: placed ids are unique", new Set(ids).size, ids.length);
})();

/* ---- report ---- */
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log("FAILED:", fails.join(" | "));
  process.exit(1);
}
