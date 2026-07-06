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

async function callModel(model, zh, apiKey) {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: `Chinese sentence: ${zh}` }] }],
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

export async function generatePuzzle(zh, apiKey) {
  let res = await callModel("gemini-2.5-flash", zh, apiKey);

  if (res.status === 429 || res.status === 503) {
    // capacity problem on Google's side ("high demand") — retry once on the
    // lighter model instead of bouncing the user
    const fallback = await callModel("gemini-2.5-flash-lite", zh, apiKey).catch(() => null);
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

  return { zh, theme: "自訂", ...puzzle };
}
