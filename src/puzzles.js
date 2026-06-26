/* ------------------------------------------------------------------ *
 *  Puzzle content. Kept separate from the engine so it can later be
 *  swapped for AI-generated puzzles without touching the logic.
 *
 *  Schema per puzzle:
 *    zh          中文題目
 *    accepted    Token[][]  — one or more valid orderings. They MUST be
 *                permutations of the same multiset (the tile pool is built
 *                from accepted[0]). Judging is case-insensitive.
 *    distractors Token[]    — grammar-trap tiles mixed into the pool.
 *    notes       {word, text}[] — shown after a correct solve.
 * ------------------------------------------------------------------ */

export const PUZZLES = [
  {
    theme: "日常",
    zh: "我每天早上喝咖啡。",
    accepted: [
      ["I", "drink", "coffee", "every", "morning"],
      ["every", "morning", "I", "drink", "coffee"],
    ],
    distractors: ["drinks", "a", "mornings", "in"],
    notes: [
      { word: "drink", text: "主詞 I 用原形 drink。只有第三人稱單數（he/she/it）才加 s。" },
      { word: "coffee", text: "coffee 在這裡不可數，不加 a。" },
      { word: "morning", text: "every 後接單數：every morning。" },
      { word: "語序", text: "Every morning 放句首也對 —— 兩種排法都收。" },
    ],
  },
  {
    theme: "日常",
    zh: "我昨天太累了，沒去健身房。",
    accepted: [
      ["I", "was", "too", "tired", "to", "go", "to", "the", "gym", "yesterday"],
      ["yesterday", "I", "was", "too", "tired", "to", "go", "to", "the", "gym"],
    ],
    distractors: ["were", "very", "went", "a"],
    notes: [
      { word: "was", text: "主詞 I 配 was，不是 were。" },
      { word: "too", text: "「太…以至於不能」用 too…to；very tired to go 不通。" },
      { word: "go", text: "to 後接原形 go，不是 went。" },
      { word: "the", text: "你固定去的那間，用 the gym。" },
    ],
  },
  {
    theme: "旅遊",
    zh: "你知道車站怎麼走嗎？",
    accepted: [["Do", "you", "know", "how", "to", "get", "to", "the", "station"]],
    distractors: ["Are", "knowing", "getting", "a", "way"],
    notes: [
      { word: "Do", text: "一般動詞問句用 Do you…，不是 Are you…。" },
      { word: "know", text: "know 是狀態動詞，不用進行式 knowing。" },
      { word: "get", text: "how to + 原形：how to get。" },
      { word: "the", text: "雙方都知道是哪個車站，用 the station。" },
    ],
  },
  {
    theme: "職場",
    zh: "我下週一前會把報告寄給你。",
    accepted: [
      ["I", "will", "send", "you", "the", "report", "by", "next", "Monday"],
      ["by", "next", "Monday", "I", "will", "send", "you", "the", "report"],
    ],
    distractors: ["sends", "sended", "to", "until", "a"],
    notes: [
      { word: "will", text: "表未來用 will + 原形 send。" },
      { word: "you", text: "send sb sth：send you the report，中間不用 to。" },
      { word: "by", text: "「在某時間前完成」用 by；until 是「持續到」，意思不同。" },
      { word: "Monday", text: "next Monday 不加 s。" },
    ],
  },
];

export const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
