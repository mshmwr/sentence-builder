/* ------------------------------------------------------------------ *
 *  Puzzle generation — calls Gemini directly from the browser with the
 *  user's own API key (stored on their account, see firebase.js).
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

async function callModel(system, model, userText, apiKey) {
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
          maxOutputTokens: 1024,
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
