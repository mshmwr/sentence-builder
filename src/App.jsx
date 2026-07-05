import React, { useState, useMemo, useEffect } from "react";
import {
  newGame,
  poolTiles,
  placedTiles,
  stars,
  placeTile,
  removeTile,
  clearAll,
  check,
  hint,
} from "./engine.js";
import { shuffle } from "./puzzles.js";
import { generatePuzzle } from "./generate.js";
import {
  watchAuth,
  loginWithGoogle,
  logout,
  loadGeminiKey,
  saveGeminiKey,
  addHistory,
  loadHistory,
} from "./firebase.js";

const LS_KEY = "pinju-gemini-key"; // key storage for logged-out users

function readLocalKey() {
  try {
    return localStorage.getItem(LS_KEY) || "";
  } catch {
    return ""; // storage blocked (private mode) — treat as no key
  }
}

function Head({ children }) {
  return (
    <header className="st-head">
      <div className="st-brand">
        <span className="st-mark">拼句</span>
        <span className="st-tag">把中文，拼成對的英文</span>
      </div>
      {children}
    </header>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [keyLoaded, setKeyLoaded] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [keySaving, setKeySaving] = useState(false);

  const [mode, setMode] = useState("input"); // "input" | "loading" | "playing" | "key" | "history"
  const [inputZh, setInputZh] = useState("");
  const [puzzle, setPuzzle] = useState(null);
  const [game, setGame] = useState(null);
  const [shake, setShake] = useState(false);
  const [nudge, setNudge] = useState("");
  const [genError, setGenError] = useState("");
  const [history, setHistory] = useState(null); // null = loading

  useEffect(() => {
    let latestUid = null; // discard key loads that resolve after an account switch
    return watchAuth(async (u) => {
      latestUid = u ? u.uid : null;
      setUser(u);
      setAuthReady(true);
      if (u) {
        setKeyLoaded(false);
        const uid = u.uid;
        let k = "";
        let loadFailed = false;
        try {
          k = await loadGeminiKey(uid);
        } catch {
          loadFailed = true; // read failure ≠ no key — must not trigger the promote-write below
        }
        if (!k && !loadFailed) {
          // logged in with a local-only key: promote it to the account
          const local = readLocalKey();
          if (local) {
            k = local;
            saveGeminiKey(uid, local)
              .then(() => localStorage.removeItem(LS_KEY)) // moved, not mirrored — see key-screen copy
              .catch(() => {});
          }
        }
        if (latestUid === uid) {
          setGeminiKey(k);
          setKeyLoaded(true);
        }
      } else {
        setGeminiKey(readLocalKey());
        setKeyLoaded(true);
        setMode((m) => (m === "history" ? "input" : m)); // history is account-only
      }
    });
  }, []);

  const order = useMemo(
    () => (game ? shuffle(game.tiles.map((t) => t.id)) : []),
    [puzzle] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const onLogin = async () => {
    setAuthError("");
    try {
      await loginWithGoogle();
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const onSaveKey = async (e) => {
    e.preventDefault();
    const k = keyDraft.trim();
    if (!k) return;
    setKeySaving(true);
    try {
      if (user) {
        await saveGeminiKey(user.uid, k);
      } else {
        localStorage.setItem(LS_KEY, k);
      }
      setGeminiKey(k);
      setKeyDraft("");
      setMode("input");
    } catch (err) {
      setAuthError(err.message);
    }
    setKeySaving(false);
  };

  const onOpenHistory = async () => {
    setMode("history");
    setHistory(null);
    try {
      setHistory(await loadHistory(user.uid));
    } catch {
      setHistory([]);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const zh = inputZh.trim();
    if (!zh) return;
    setGenError("");
    setMode("loading");
    try {
      const generated = await generatePuzzle(zh, geminiKey);
      setPuzzle(generated);
      setGame(newGame(generated));
      setShake(false);
      setNudge("");
      setMode("playing");
    } catch (err) {
      setGenError(err.message);
      setMode("input");
    }
  };

  const onReplay = (h) => {
    let p;
    try {
      p = JSON.parse(h.puzzle);
    } catch {
      return; // corrupt stored record — ignore the tap
    }
    setPuzzle(p);
    setGame(newGame(p));
    setShake(false);
    setNudge("");
    setGenError("");
    setMode("playing");
  };

  const onNewSentence = () => {
    setMode("input");
    setPuzzle(null);
    setGame(null);
    setNudge("");
    setGenError("");
  };

  const onPlace = (id) => {
    setGame(placeTile(game, id));
    setNudge("");
  };
  const onRemove = (pos) => setGame(removeTile(game, pos));
  const onClear = () => setGame(clearAll(game));
  const onHint = () => {
    setGame(hint(game, puzzle));
    setNudge("");
  };
  const onCheck = () => {
    if (game.status === "correct") return; // write-once guard for addHistory
    if (game.placedIds.length === 0) {
      setNudge("先把牌排上去再檢查。");
      return;
    }
    const ng = check(game, puzzle);
    setGame(ng);
    if (ng.status === "correct") {
      if (user) {
        addHistory(user.uid, {
          zh: puzzle.zh,
          en: placedTiles(ng).map((t) => t.word).join(" "),
          stars: stars(ng),
          hints: ng.hints,
          misses: ng.misses,
          puzzle: JSON.stringify(puzzle), // string, not object — Firestore rejects nested arrays (accepted)
        }).catch(() => {}); // history write failing must not block the game
      }
    } else if (ng.wrongIdx.length) {
      setShake(true);
      setTimeout(() => setShake(false), 450);
      setNudge("被標紅的塊再想一下 —— 通常卡在時態、冠詞或介係詞。");
    }
  };

  const accountBar = (
    <div className="st-account">
      {user ? (
        <>
          <button className="st-linkbtn" onClick={onOpenHistory}>歷史</button>
          <button className="st-linkbtn" onClick={() => setMode("key")}>Key</button>
          <button className="st-linkbtn" onClick={() => logout()}>登出</button>
        </>
      ) : (
        <>
          <button className="st-linkbtn" onClick={() => setMode("key")}>Key</button>
          <button className="st-linkbtn" onClick={onLogin}>登入</button>
        </>
      )}
    </div>
  );

  /* ---- boot gate: wait for auth + key resolution ---- */
  if (!authReady || !keyLoaded) {
    return (
      <div className="st-root">
        <div className="st-board">
          <Head />
          <div className="st-loading">
            <span className="st-spinner" />
          </div>
        </div>
      </div>
    );
  }

  /* ---- history screen (before the key gate — history needs no key) ---- */
  if (mode === "history") {
    return (
      <div className="st-root">
        <div className="st-board">
          <Head>{accountBar}</Head>
          {history === null ? (
            <div className="st-loading">
              <span className="st-spinner" />
            </div>
          ) : history.length === 0 ? (
            <p className="st-login-text">還沒有紀錄 —— 拼出第一句吧。</p>
          ) : (
            <div className="st-history">
              {history.map((h) => (
                <div className="st-hitem" key={h.id}>
                  <div className="st-hrow">
                    <span className="st-hzh">{h.zh}</span>
                    <span className="st-hstars">
                      {"★".repeat(h.stars)}
                      <span className="st-hstars-off">{"★".repeat(3 - h.stars)}</span>
                    </span>
                  </div>
                  <div className="st-hen">{h.en}</div>
                  <div className="st-hmeta">
                    <span>
                      {h.createdAt?.toDate ? h.createdAt.toDate().toLocaleString() : ""}
                    </span>
                    {h.puzzle && (
                      <button className="st-linkbtn" onClick={() => onReplay(h)}>
                        再拼一次
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="st-controls st-back-row">
            <button className="btn ghost" onClick={() => setMode("input")}>
              返回
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ---- Gemini key setup (first time: no key yet; later: via Key button).
          Replay ("playing") passes through — it runs on the local engine, no key needed. ---- */
  if (mode === "key" || (!geminiKey && mode !== "playing")) {
    return (
      <div className="st-root">
        <div className="st-board">
          <Head>{accountBar}</Head>
          <form className="st-input-form" onSubmit={onSaveKey}>
            <label className="st-input-label" htmlFor="key-input">
              貼上你的 Gemini API key
            </label>
            <input
              id="key-input"
              className="st-input-area st-key-input"
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder={geminiKey ? "已設定過，貼上新的 key 可更換" : "AIza…"}
              autoFocus
            />
            <p className="st-keyhelp">
              出題用你自己的 Gemini 額度。到{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                Google AI Studio
              </a>{" "}
              免費取得。
              {user
                ? "key 只存在你的帳號資料裡。"
                : "key 只存在這台瀏覽器；登入後會改存到你的帳號。"}
            </p>
            {authError && <p className="st-gen-error">{authError}</p>}
            <div className="st-controls">
              {(geminiKey || game) && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setMode(geminiKey ? "input" : "playing")}
                >
                  返回
                </button>
              )}
              <button
                type="submit"
                className="btn solid"
                disabled={!keyDraft.trim() || keySaving}
              >
                {keySaving ? "儲存中…" : "儲存"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  /* ---- input screen ---- */
  if (mode === "input") {
    return (
      <div className="st-root">
        <div className="st-board">
          <Head>{accountBar}</Head>
          <form className="st-input-form" onSubmit={onSubmit}>
            <label className="st-input-label" htmlFor="zh-input">
              輸入一個中文句子
            </label>
            <textarea
              id="zh-input"
              className="st-input-area"
              value={inputZh}
              onChange={(e) => setInputZh(e.target.value)}
              placeholder="例：我昨天忘記帶雨傘。"
              rows={3}
              autoFocus
            />
            {authError && <p className="st-gen-error">{authError}</p>}
            {genError && <p className="st-gen-error">{genError}</p>}
            <button
              type="submit"
              className="btn solid st-input-btn"
              disabled={!inputZh.trim()}
            >
              生成題目
            </button>
          </form>
        </div>
      </div>
    );
  }

  /* ---- loading screen ---- */
  if (mode === "loading") {
    return (
      <div className="st-root">
        <div className="st-board">
          <Head />
          <div className="st-loading">
            <span className="st-spinner" />
            <p>正在生成題目…</p>
          </div>
        </div>
      </div>
    );
  }

  /* ---- playing screen ---- */
  const pool = poolTiles(game);
  const poolById = Object.fromEntries(pool.map((t) => [t.id, t]));
  const orderedPool = order.map((id) => poolById[id]).filter(Boolean);
  const placed = placedTiles(game);
  const slots = puzzle.accepted[0].length;
  const correct = game.status === "correct";

  return (
    <div className="st-root">
      <div className="st-board">
        <Head>{accountBar}</Head>

        <div className="st-prompt">
          <div className="st-chip">{puzzle.theme}</div>
          <p className="st-zh">{puzzle.zh}</p>
        </div>

        <div className={"st-rack" + (shake ? " shake" : "")}>
          {Array.from({ length: slots }).map((_, i) => {
            const t = placed[i];
            const isWrong = game.wrongIdx.includes(i);
            const locked = t && game.lockedIds.includes(t.id);
            return (
              <div className="st-slot" key={i}>
                {t ? (
                  <button
                    className={
                      "tile placed" +
                      (correct ? " ok" : "") +
                      (isWrong ? " bad" : "") +
                      (locked ? " locked" : "")
                    }
                    onClick={() => onRemove(i)}
                    disabled={locked || correct}
                  >
                    {t.word}
                    {locked && <span className="lock">●</span>}
                  </button>
                ) : (
                  <span className="st-empty" />
                )}
              </div>
            );
          })}
        </div>

        <div className="st-pool">
          {orderedPool.length === 0 ? (
            <span className="st-poolhint">牌都用上了，按「檢查」看看對不對</span>
          ) : (
            orderedPool.map((t) => (
              <button key={t.id} className="tile" onClick={() => onPlace(t.id)}>
                {t.word}
              </button>
            ))
          )}
        </div>

        {!correct ? (
          <div className="st-controls">
            <button className="btn ghost" onClick={onHint}>
              提示
            </button>
            <button className="btn ghost" onClick={onClear}>
              清除
            </button>
            <button className="btn solid" onClick={onCheck}>
              檢查
            </button>
          </div>
        ) : (
          <div className="st-controls">
            <button className="btn solid" onClick={onNewSentence}>
              再一句
            </button>
          </div>
        )}

        <p className="st-nudge" aria-live="polite">
          {!correct ? nudge : ""}
        </p>

        {correct && (
          <div className="st-result">
            <div className="st-stars">
              {[0, 1, 2].map((s) => (
                <span key={s} className={"star" + (s < stars(game) ? " fill" : "")}>
                  ★
                </span>
              ))}
              <span className="st-scoreline">
                {game.hints === 0 && game.misses === 0
                  ? "完美，沒提示也沒踩雷"
                  : `用了 ${game.hints} 次提示、錯 ${game.misses} 次`}
              </span>
            </div>
            {!user && (
              <p className="st-keyhelp">登入 Google 後，過關紀錄會存到你的帳號。</p>
            )}
            <div className="st-notes">
              {puzzle.notes.map((n, i) => (
                <div className="note" key={i} style={{ animationDelay: `${i * 80}ms` }}>
                  <span className="note-word">{n.word}</span>
                  <span className="note-text">{n.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
