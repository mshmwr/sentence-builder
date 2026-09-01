/* ------------------------------------------------------------------ *
 *  Puzzle generation — calls Gemini directly, given an API key.
 *  Two callers: the browser, for custom (自訂輸入) sentences, using the
 *  user's own key (stored on their account, see firebase.js); and
 *  scripts/fetch-cnn-sentences.mjs, run once a day in CI, which
 *  pre-generates the daily CNN puzzles so the client never has to.
 * ------------------------------------------------------------------ */

const SYSTEM = `You are an English grammar puzzle generator for Chinese native speakers.

TASK: Translate the Chinese sentence into English, then break it into individual English word tokens for a tile-assembly puzzle.

Output ONLY a JSON object (no markdown, no commentary):
{"accepted":[["EnglishWord1","EnglishWord2",...]],"distractors":["WrongWord1"],"notes":[{"word":"EnglishWord","text":"Traditional Chinese grammar note","category":"時態"}]}

EXAMPLE — Chinese: 我每天早上喝咖啡。
Output:
{"accepted":[["I","drink","coffee","every","morning"],["every","morning","I","drink","coffee"]],"distractors":["drinks","a","mornings","in"],"notes":[{"word":"drink","text":"主詞 I 用原形 drink，第三人稱單數才加 s。","category":"時態"},{"word":"coffee","text":"coffee 在此不可數，不加 a。","category":"冠詞"}]}

RULES:
1. accepted = ENGLISH word tokens. NOT Chinese.
2. All accepted variants = permutations of the SAME English token set.
3. distractors = 3-6 plausible-but-wrong English words.
4. notes = 3-5 grammar tips in Traditional Chinese.
5. Every note's category is exactly one of: 時態, 冠詞, 介係詞, 單複數, 其他.
6. Return ONLY the JSON. Nothing else.`;

// Source sentence is real English (a news headline) rather than the user's
// own Chinese — so the model must produce the Chinese prompt too. Unlike
// SYSTEM above, the English side is fixed input, not something to compose:
// the headline must be tokenized verbatim, never rewritten/completed, even
// when it reads as a sentence fragment — the puzzle has to stay an accurate
// reflection of what CNN actually published.
const SYSTEM_EN = `You are an English grammar puzzle generator for Chinese native speakers.

You will be given a real English sentence taken from a news headline.

TASK:
1. Translate it into natural Traditional Chinese — this becomes the puzzle prompt the learner reads. Translate exactly what the headline says; do not paraphrase, expand, or "fix" it into a different sentence.
2. Break the sentence into individual word tokens for a tile-assembly puzzle, using the EXACT wording given — do not rewrite, complete, or rephrase it, even if it reads as a fragment or drops articles/verbs headline-style. Every token must be a word that appears in the original sentence.

Output ONLY a JSON object (no markdown, no commentary):
{"zh":"Traditional Chinese translation","accepted":[["EnglishWord1","EnglishWord2",...]],"distractors":["WrongWord1"],"notes":[{"word":"EnglishWord","text":"Traditional Chinese grammar note","category":"時態"}]}

RULES:
1. zh = Traditional Chinese only, and must translate the ORIGINAL headline, not a rewritten version of it.
2. accepted = ENGLISH word tokens, unchanged from the source sentence. NOT Chinese, NOT rewritten wording.
3. All accepted variants = permutations of the SAME English token set.
4. distractors = 3-6 plausible-but-wrong English words.
5. notes = 3-5 grammar tips in Traditional Chinese.
6. Every note's category is exactly one of: 時態, 冠詞, 介係詞, 單複數, 其他.
7. Return ONLY the JSON. Nothing else.`;

async function callModel(system, model, userText, apiKey, maxOutputTokens = 1024) {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.3,
          maxOutputTokens,
          thinkingConfig: { thinkingBudget: 0 }, // no thinking: faster generation, JSON task doesn't need it
        },
      }),
    }
  );
}

async function runPuzzleModel(system, userText, apiKey) {
  let res = await callModel(system, "gemini-2.5-flash", userText, apiKey);

  if (res.status === 429 || res.status === 503) {
    // capacity problem on Google's side ("high demand") — retry once on the
    // lighter model instead of bouncing the user
    const fallback = await callModel(system, "gemini-2.5-flash-lite", userText, apiKey).catch(
      () => null
    );
    if (fallback?.ok) res = fallback;
    // fallback failed too: keep the primary response so the error the user
    // sees describes the main model, not the retry
  }

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message || `Gemini API ${res.status}`);
  }

  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || "")
    .join("")
    .trim();

  let puzzle;
  try {
    puzzle = JSON.parse(text);
  } catch {
    throw new Error("模型回傳的不是有效 JSON，請再試一次。");
  }
  if (
    !Array.isArray(puzzle.accepted) ||
    puzzle.accepted.length === 0 ||
    !Array.isArray(puzzle.accepted[0]) ||
    puzzle.accepted[0].length === 0
  ) {
    throw new Error("題目生成失敗（accepted 為空），請再試一次。");
  }
  puzzle.distractors = Array.isArray(puzzle.distractors) ? puzzle.distractors : [];
  puzzle.notes = Array.isArray(puzzle.notes) ? puzzle.notes : [];

  return puzzle;
}

export async function generatePuzzle(zh, apiKey) {
  const puzzle = await runPuzzleModel(SYSTEM, `Chinese sentence: ${zh}`, apiKey);
  return { zh, theme: "自訂", ...puzzle };
}

// sourceEn/sourceUrl are provenance for the "今日新聞" tab — kept on the
// puzzle so the UI can link back to the original CNN article.
export async function generatePuzzleFromEnglish(en, apiKey, sourceUrl) {
  const puzzle = await runPuzzleModel(SYSTEM_EN, `English sentence: ${en}`, apiKey);
  if (!puzzle.zh || typeof puzzle.zh !== "string") {
    throw new Error("題目生成失敗（缺少中文題目），請再試一次。");
  }
  return { theme: "今日新聞", sourceEn: en, sourceUrl, ...puzzle };
}

// Same job as SYSTEM_EN, but for a whole day's headline batch in one call —
// scripts/fetch-cnn-sentences.mjs uses this instead of calling
// generatePuzzleFromEnglish once per sentence, so the daily job costs one
// Gemini request total, not one per headline (which is what was tripping the
// free-tier per-minute quota).
const SYSTEM_EN_BATCH = `You are an English grammar puzzle generator for Chinese native speakers.

You will be given a numbered list of real English sentences, each taken from a news headline.

TASK, for EACH sentence independently:
1. Translate it into natural Traditional Chinese — this becomes the puzzle prompt the learner reads. Translate exactly what that headline says; do not paraphrase, expand, or "fix" it into a different sentence.
2. Break the sentence into individual word tokens for a tile-assembly puzzle, using the EXACT wording given — do not rewrite, complete, or rephrase it, even if it reads as a fragment or drops articles/verbs headline-style. Every token must be a word that appears in that sentence.

Output ONLY a JSON array (no markdown, no commentary) with exactly one object per input sentence, IN THE SAME ORDER as given:
[{"zh":"Traditional Chinese translation","accepted":[["EnglishWord1","EnglishWord2",...]],"distractors":["WrongWord1"],"notes":[{"word":"EnglishWord","text":"Traditional Chinese grammar note","category":"時態"}]}, ...]

RULES:
1. The output array's length MUST equal the number of input sentences, in the same order — element i answers input sentence i.
2. zh = Traditional Chinese only, and must translate that ORIGINAL headline, not a rewritten version of it.
3. accepted = ENGLISH word tokens, unchanged from that sentence. NOT Chinese, NOT rewritten wording.
4. All accepted variants (if more than one) = permutations of the SAME English token set.
5. distractors = 3-6 plausible-but-wrong English words.
6. notes = 3-5 grammar tips in Traditional Chinese.
7. Every note's category is exactly one of: 時態, 冠詞, 介係詞, 單複數, 其他.
8. Return ONLY the JSON array. Nothing else — no markdown fences, no per-item commentary.`;

// Output grows linearly with input count, unlike the ~1024-token single-
// sentence budget above — 12 headlines' worth of zh/accepted/distractors/
// notes comfortably needs more room.
const BATCH_MAX_OUTPUT_TOKENS = 16384;

async function runBatchModel(system, userText, apiKey) {
  let res = await callModel(system, "gemini-2.5-flash", userText, apiKey, BATCH_MAX_OUTPUT_TOKENS);

  if (res.status === 429 || res.status === 503) {
    const fallback = await callModel(
      system,
      "gemini-2.5-flash-lite",
      userText,
      apiKey,
      BATCH_MAX_OUTPUT_TOKENS
    ).catch(() => null);
    if (fallback?.ok) res = fallback;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message || `Gemini API ${res.status}`);
  }

  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || "")
    .join("")
    .trim();

  let results;
  try {
    results = JSON.parse(text);
  } catch {
    throw new Error("模型回傳的不是有效 JSON 陣列，請再試一次。");
  }
  if (!Array.isArray(results)) {
    throw new Error("模型回傳格式錯誤（預期是陣列）。");
  }
  return results;
}

// sentences: [{en, url}]. One Gemini call for the whole batch — returns only
// the entries that parsed into a usable puzzle, each shaped like
// generatePuzzleFromEnglish's return value plus the original {en, url}, so
// callers don't need to know batch vs per-item happened.
export async function generatePuzzlesBatch(sentences, apiKey) {
  const userText = sentences.map((s, i) => `${i + 1}. ${s.en}`).join("\n");
  const results = await runBatchModel(SYSTEM_EN_BATCH, userText, apiKey);

  if (results.length !== sentences.length) {
    console.error(
      `Batch returned ${results.length} results for ${sentences.length} input sentences — mismatched entries are dropped.`
    );
  }

  const withPuzzles = [];
  sentences.forEach((s, i) => {
    const r = results[i];
    if (
      !r ||
      typeof r.zh !== "string" ||
      !r.zh ||
      !Array.isArray(r.accepted) ||
      !Array.isArray(r.accepted[0]) ||
      r.accepted[0].length === 0
    ) {
      console.error(`Skipping "${s.en}": batch result at index ${i} is missing or malformed`);
      return;
    }
    withPuzzles.push({
      en: s.en,
      url: s.url,
      puzzle: {
        theme: "今日新聞",
        sourceEn: s.en,
        sourceUrl: s.url,
        zh: r.zh,
        accepted: r.accepted,
        distractors: Array.isArray(r.distractors) ? r.distractors : [],
        notes: Array.isArray(r.notes) ? r.notes : [],
      },
    });
  });
  return withPuzzles;
}
