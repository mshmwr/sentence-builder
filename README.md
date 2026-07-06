# 拼句 (Pīn Jù)

把中文，拼成對的英文。給中文母語者的英文造句練習 —— 不用憑空產出英文，而是從一堆字塊裡**選對、排對**。牌堆裡混了「文法陷阱」干擾塊（時態、冠詞、介係詞、單複數），解題的過程就是在做這些文法決定。麻將牌的視覺語彙：骨白牌、墨綠氈面，選對時翻成玉綠並亮出文法註解。

## 跑起來

```bash
npm install
npm run dev      # 開發伺服器
npm run build    # 打包
npm test         # 跑引擎單元測試（零依賴，純 node）
```

## 架構

關鍵設計是**邏輯與畫面分離**，所以遊戲邏輯能在沒有 React、沒有瀏覽器的情況下被測試。

```
src/
  engine.js    純函式遊戲引擎，唯一真相來源。沒有任何 React。
  puzzles.js   題庫內容（與引擎解耦，之後可換成 AI 產出）。
  generate.js  出題：瀏覽器直接打 Gemini API（使用者自己的 key）。
  firebase.js  Google 登入 + Firestore（geminiKey、歷史紀錄，皆綁帳號）。
  App.jsx      只負責畫面與事件，不含判定邏輯。
  main.jsx     入口。
  styles.css   樣式。
tests/
  engine.test.js   覆蓋引擎每一個函式（npm test）。
firestore.rules    Firestore 安全規則：只能讀寫自己 uid 底下的資料。
```

### 帳號與出題

- **Gemini key**：使用者自己到 [Google AI Studio](https://aistudio.google.com/apikey)
  取得。貼上即可玩，不必登入——未登入時存 localStorage，登入後存
  `users/{uid}.geminiKey`（Firestore，跨裝置同步）。帶著 local key 登入會自動把 key
  搬到帳號（搬移，非鏡像：搬完刪掉 local 那份）。出題額度算使用者自己的。
- **登入（選配）**：Firebase Auth（Google）。登入的價值是歷史紀錄 + key 跨裝置。
- **歷史紀錄**：僅登入時記錄。過關即寫入 `users/{uid}/history`（中文題、拼出的英文、星數）。
  「歷史」畫面列出最近 50 筆。

### 單一真相來源

`tiles` 是唯一的牌列表；`placedIds`（有序）與 `lockedIds` 推導出其餘所有狀態。
「每塊牌剛好在一個地方」這個不變式因此不會因為兩份陣列沒同步而壞掉。
所有動作都是純函式 `state -> state`（`placeTile` / `removeTile` / `clearAll` / `check` / `hint`）。

### 多答案判定

`puzzle.accepted` 是 `Token[][]`：一題可有多個合法排列（例如時間副詞放句首），
任一命中即過關，且大小寫不敏感。注意所有 `accepted` 變體必須是**同一組字的重排**，
因為牌堆是從 `accepted[0]` 建出來的。

> 設計邊界：「從固定牌堆組字」先天只能容許**語序變體**，無法容許「換一批用字的另一種講法」。
> 後者需要的是自由打字 + AI 判分，是另一種互動模式。

## 路線圖（下一步）

題庫目前寫死在 `puzzles.js`。因為判定（引擎）跟出題（內容）已經解耦，
下一步可接 Claude API：輸入一個中文句，即時生成 `accepted` + `distractors` 灌進引擎，
就能「用自己的句子玩」。判分仍交給引擎、出題交給 AI，兩邊互不影響。

## 推到 GitHub

```bash
git init
git add .
git commit -m "feat: 拼句 prototype — tile-assembly grammar game"
git branch -M main
git remote add origin git@github.com:<你的帳號>/pinju.git
git push -u origin main
```
