import { nextInterval } from "../src/review.js";

/* ---- tiny zero-dependency assert harness (mirrors engine.test.js) ---- */
let pass = 0,
  fail = 0;
const fails = [];
function ok(name, cond) {
  if (cond) pass++;
  else {
    fail++;
    fails.push(name);
    console.log("  ✗ " + name);
  }
}

/* ---- nextInterval ---- */
ok("0-1 star always resets to 1 day, regardless of prior interval", nextInterval(0, 0) === 1);
ok("0-1 star resets even a long streak back to 1 day", nextInterval(40, 1) === 1);
ok("first-ever 2-star review schedules 1 day out", nextInterval(0, 2) === 1);
ok("first-ever 3-star review schedules 1 day out", nextInterval(0, 3) === 1);
ok("2 stars grows an existing interval by 1.3x (rounded)", nextInterval(10, 2) === 13);
ok("3 stars grows an existing interval faster than 2 stars", nextInterval(10, 3) === 22);
ok("2-star growth is capped at 30 days", nextInterval(1000, 2) === 30);
ok("3-star growth is capped at 60 days", nextInterval(1000, 3) === 60);
ok("interval grows monotonically across repeated 3-star reviews, capped at 60", (() => {
  let interval = 0;
  let prev = -1;
  for (let i = 0; i < 12; i++) {
    interval = nextInterval(interval, 3);
    if (interval < prev) return false;
    prev = interval;
  }
  return interval === 60;
})());
ok("a slipped review (2 stars) shrinks a long streak back down", nextInterval(60, 2) < 60);

/* ---- report ---- */
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log("FAILED:", fails.join(" | "));
  process.exit(1);
}
