// Regression test for the headline+dek concatenation bug reported 2026-11-21:
// a card's visible "headline" turned out to be the real headline glued
// straight onto a sibling description/dek div, because extractCandidates()
// used to read the whole <a>'s text. Fixtures below are trimmed real CNN
// anchor markup (captured via a diagnostic Actions run against the live
// homepage) for the two shapes that matter: headline+dek, and headline-only.
import assert from "node:assert/strict";
import { extractCandidates } from "../scripts/fetch-cnn-sentences.mjs";

function page(anchors) {
  return `<!doctype html><html><body>${anchors.join("\n")}</body></html>`;
}

// --- case 1: headline with a sibling description div (the bug's shape) ---
{
  const anchor = `
    <a href="/2026/11/20/investing/us-stocks-anthropic-ai" class="container__link container_lead-plus-headlines__link" data-link-type="article">
      <div class="container__text container_lead-plus-headlines__text">
        <div class="container__headline container_lead-plus-headlines__headline">
          <span class="container__headline-text" data-editable="headline">Nasdaq wipes out gains for the year as Anthropic IPO fails to quell AI nerves</span>
        </div>
        <div class="container__description container_lead-plus-headlines__description inline-placeholder" data-editable="description">
          The S&amp;P 500 posted its longest losing streak since February 2020, when Wall Street started bracing for what became the Covid pandemic
        </div>
      </div>
    </a>`;
  const candidates = extractCandidates(page([anchor]));
  assert.equal(candidates.length, 1);
  assert.equal(
    candidates[0].en,
    "Nasdaq wipes out gains for the year as Anthropic IPO fails to quell AI nerves"
  );
  console.log("case 1 OK: headline+dek card returns headline only, no concatenation");
}

// --- case 2: headline-only card, no description sibling at all ---
{
  const anchor = `
    <a href="/2026/11/20/politics/himes-ukraine-starlink-slowdown" class="container__link container__link--type-article container_list-headlines__link container_list-headlines__left container_list-headlines__light" data-link-type="article">
      <div class="container__text container_list-headlines__text">
        <div class="container__headline container_list-headlines__headline">
          <span class="container__headline-text" data-editable="headline">Trump intel chief is warned no funding for Musk's SpaceX without answers on Ukraine Starshield slowdown</span>
        </div>
      </div>
    </a>`;
  const candidates = extractCandidates(page([anchor]));
  assert.equal(candidates.length, 1);
  assert.equal(
    candidates[0].en,
    "Trump intel chief is warned no funding for Musk's SpaceX without answers on Ukraine Starshield slowdown"
  );
  console.log("case 2 OK: headline-only card (no description sibling) still extracts cleanly");
}

// --- case 3: video card with a label/duration prefix in front of the headline span ---
{
  const anchor = `
    <a href="/2026/11/19/weather/west-coast-waves-storms" class="container__link container_lead-plus-headlines__link" data-link-type="article">
      <div class="card__label-container"><span class="card__label">Video</span><span class="card__duration">0:28</span></div>
      <div class="container__text container_lead-plus-headlines__text">
        <div class="container__headline container_lead-plus-headlines__headline">
          <span class="container__headline-text" data-editable="headline">Massive waves engulf beaches along West Coast</span>
        </div>
        <span class="container__duration-icon">0:28</span>
        <div class="container__description container_lead-plus-headlines__description" data-editable="description">
          The first in a series of storms hits the West Coast, prompting high surf warnings
        </div>
      </div>
    </a>`;
  const candidates = extractCandidates(page([anchor]));
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].en, "Massive waves engulf beaches along West Coast");
  console.log("case 3 OK: video card's label/duration/dek chrome is excluded, headline only");
}

// --- case 4: no .container__headline-text at all -> falls back to whole-anchor text ---
{
  const anchor = `
    <a href="/2026/11/18/sport/some-plain-card" data-link-type="article">
      This is a plain anchor with no dedicated headline span at all here
    </a>`;
  const candidates = extractCandidates(page([anchor]));
  assert.equal(candidates.length, 1);
  assert.equal(
    candidates[0].en,
    "This is a plain anchor with no dedicated headline span at all here"
  );
  console.log("case 4 OK: card without .container__headline-text falls back to anchor text");
}

console.log("\nALL extract-candidates TESTS PASSED");
