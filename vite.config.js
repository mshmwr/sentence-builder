import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const SYSTEM = `You are an English grammar puzzle generator for Chinese native speakers.

TASK: Translate the Chinese sentence into English, then break it into individual English word tokens for a tile-assembly puzzle.

Output ONLY a JSON object with this exact shape (no markdown, no commentary):
{
  "accepted": [["EnglishWord1","EnglishWord2",...]],
  "distractors": ["WrongEnglishWord1","WrongEnglishWord2"],
  "notes": [{"word":"EnglishWord","text":"Traditional Chinese grammar note"}]
}

EXAMPLE — Chinese: 我每天早上喝咖啡。
Output:
{"accepted":[["I","drink","coffee","every","morning"],["every","morning","I","drink","coffee"]],"distractors":["drinks","a","mornings","in"],"notes":[{"word":"drink","text":"主詞 I 用原形 drink，第三人稱單數才加 s。"},{"word":"coffee","text":"coffee 在此不可數，不加 a。"},{"word":"morning","text":"every 後接單數：every morning。"}]}

RULES:
1. accepted contains ENGLISH word tokens (the translation), NOT Chinese characters.
2. All accepted variants must be permutations of the SAME set of English tokens (same words, different order only).
3. distractors are 3–6 English words that look plausible but are grammatically wrong (wrong tense, wrong article, wrong preposition, wrong plural, etc.).
4. notes contain 3–5 grammar tips written in Traditional Chinese.
5. Return ONLY the JSON object. Nothing else.`;

function generateApiPlugin() {
  return {
    name: "generate-api",
    configureServer(server) {
      server.middlewares.use("/api/generate", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method Not Allowed");
          return;
        }
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", async () => {
          try {
            const { zh } = JSON.parse(body);
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
            // MiniMax M2.7 sometimes puts output in reasoning_content instead of content
            let content = (msg.content || msg.reasoning_content || "").trim();
            // strip markdown fences if the model wrapped the output
            content = content.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "");
            const puzzle = JSON.parse(content);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ zh, theme: "自訂", ...puzzle }));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: err.message }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), generateApiPlugin()],
});
