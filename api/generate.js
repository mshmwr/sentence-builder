const SYSTEM = `You are an English grammar puzzle generator for Chinese native speakers.

TASK: Translate the Chinese sentence into English, then break it into individual English word tokens for a tile-assembly puzzle.

Output ONLY a JSON object (no markdown, no commentary):
{"accepted":[["EnglishWord1","EnglishWord2",...]],"distractors":["WrongWord1"],"notes":[{"word":"EnglishWord","text":"Traditional Chinese grammar note"}]}

EXAMPLE — Chinese: 我每天早上喝咖啡。
Output:
{"accepted":[["I","drink","coffee","every","morning"],["every","morning","I","drink","coffee"]],"distractors":["drinks","a","mornings","in"],"notes":[{"word":"drink","text":"主詞 I 用原形 drink，第三人稱單數才加 s。"},{"word":"coffee","text":"coffee 在此不可數，不加 a。"}]}

RULES:
1. accepted = ENGLISH word tokens. NOT Chinese.
2. All accepted variants = permutations of the SAME English token set.
3. distractors = 3-6 plausible-but-wrong English words.
4. notes = 3-5 grammar tips in Traditional Chinese.
5. Return ONLY the JSON. Nothing else.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const { zh } = req.body;
    const resp = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model: "minimaxai/minimax-m2.7",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Chinese sentence: ${zh}` },
        ],
        max_tokens: 1024,
        temperature: 0.3,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`NVIDIA API ${resp.status}: ${err}`);
    }

    const data = await resp.json();
    const msg = data.choices[0].message;
    let content = (msg.content || msg.reasoning_content || "").trim();
    content = content.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "");
    const puzzle = JSON.parse(content);

    res.status(200).json({ zh, theme: "自訂", ...puzzle });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
